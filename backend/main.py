import asyncio
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from kubernetes import client, config, watch

from auth.dependencies import get_user_id
from auth.websocket_auth import authenticate_websocket
from k8s.k8s_manager import K8sManager
from models.game_models import GameServerResponse

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
k8s = K8sManager()

# Configure CORS with environment-based origins
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/gameserver", response_model=GameServerResponse)
def create_game_server(
    game: str = "minecraft",
    memory: str = "2G",
    user_id: str = Depends(get_user_id)
):
    """Create a new game server for the authenticated user"""
    # Load local kubeconfig or in-cluster credentials
    try:
        config.load_incluster_config()
    except:
        config.load_kube_config()

    namespace = f"server-{user_id}"
    v1 = client.CoreV1Api()
    apps = client.AppsV1Api()

    # ---------------------------
    # Create Namespace
    # ---------------------------
    ns_body = client.V1Namespace(
        metadata=client.V1ObjectMeta(name=namespace)
    )

    try:
        v1.create_namespace(ns_body)
    except client.exceptions.ApiException as e:
        if e.status != 409:
            raise

    # ---------------------------
    # Create PersistentVolumeClaim
    # ---------------------------
    pvc_name = f"{game}-data"
    pvc = client.V1PersistentVolumeClaim(
        metadata=client.V1ObjectMeta(name=pvc_name),
        spec=client.V1PersistentVolumeClaimSpec(
            access_modes=["ReadWriteOnce"],
            resources=client.V1VolumeResourceRequirements(
                requests={"storage": "10Gi"}
            ),
        ),
    )

    try:
        v1.create_namespaced_persistent_volume_claim(namespace=namespace, body=pvc)
    except client.exceptions.ApiException as e:
        if e.status != 409:  # Ignore if already exists
            raise

    # ---------------------------
    # Create Deployment
    # ---------------------------
    container = client.V1Container(
        name=game,
        image="itzg/minecraft-server",
        ports=[client.V1ContainerPort(container_port=25565)],
        env=[
            client.V1EnvVar(name="EULA", value="TRUE"),
            client.V1EnvVar(name="MEMORY", value=memory),
        ],
        volume_mounts=[
            client.V1VolumeMount(
                name="game-data",
                mount_path="/data",
            )
        ],
    )

    template = client.V1PodTemplateSpec(
        metadata=client.V1ObjectMeta(labels={"app": game}),
        spec=client.V1PodSpec(
            containers=[container],
            volumes=[
                client.V1Volume(
                    name="game-data",
                    persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(
                        claim_name=pvc_name,
                    ),
                )
            ],
        ),
    )

    deployment = client.V1Deployment(
        metadata=client.V1ObjectMeta(name=game),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(match_labels={"app": game}),
            template=template,
        ),
    )

    apps.create_namespaced_deployment(
        namespace=namespace,
        body=deployment,
    )

    # ---------------------------
    # Create Service
    # ---------------------------
    service = client.V1Service(
        metadata=client.V1ObjectMeta(name=f"{game}-service"),
        spec=client.V1ServiceSpec(
            type="LoadBalancer",
            selector={"app": game},
            ports=[client.V1ServicePort(port=25565, target_port=25565)],
        ),
    )

    v1.create_namespaced_service(namespace=namespace, body=service)

    # ---------------------------
    # Wait for External IP
    # ---------------------------
    external_ip = None

    for _ in range(60):  # wait up to 60 seconds
        svc = v1.read_namespaced_service(
            name=f"{game}-service",
            namespace=namespace
        )

        lb = svc.status.load_balancer.ingress
        if lb:
            external_ip = lb[0].ip or lb[0].hostname
            break
        time.sleep(2)

    if not external_ip:
        external_ip = "PENDING"

    return {
        "namespace": namespace,
        "ip": external_ip,
        "port": 25565,
        "status": "ready" if external_ip != "PENDING" else "provisioning"
    }


@app.post("/gameserver/stop")
def stop_server(user_id: str = Depends(get_user_id)):
    """Stop the game server for the authenticated user"""
    namespace = f"server-{user_id}"
    k8s.scale_deployment(namespace, "minecraft", 0)
    return {"status": "stopped"}


@app.post("/gameserver/start")
def start_server(user_id: str = Depends(get_user_id)):
    """Start the game server for the authenticated user"""
    namespace = f"server-{user_id}"
    k8s.scale_deployment(namespace, "minecraft", 1)
    return {"status": "started"}


@app.delete("/gameserver")
def delete_server(user_id: str = Depends(get_user_id)):
    """Delete the game server for the authenticated user"""
    namespace = f"server-{user_id}"
    k8s.delete_namespace(namespace)
    return {"status": "deleted"}


@app.get("/gameserver")
def get_server(user_id: str = Depends(get_user_id)):
    """Get existing server information for the authenticated user"""
    namespace = f"server-{user_id}"

    try:
        config.load_incluster_config()
    except:
        config.load_kube_config()

    v1 = client.CoreV1Api()

    try:
        # Check if namespace exists
        v1.read_namespace(namespace)
    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="No server found")
        raise HTTPException(status_code=500, detail=str(e))

    # Get service to retrieve IP
    try:
        service = v1.read_namespaced_service(name="minecraft-service", namespace=namespace)

        external_ip = "PENDING"
        if service.status.load_balancer and service.status.load_balancer.ingress:
            ingress = service.status.load_balancer.ingress[0]
            external_ip = ingress.ip or ingress.hostname or "PENDING"

        return {
            "namespace": namespace,
            "ip": external_ip,
            "port": 25565,
            "status": "ready" if external_ip != "PENDING" else "provisioning"
        }
    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="Server service not found")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/gameserver/pods")
def get_pods(user_id: str = Depends(get_user_id)):
    """Get list of pods for the authenticated user's namespace"""
    namespace = f"server-{user_id}"
    try:
        config.load_incluster_config()
    except:
        config.load_kube_config()

    v1 = client.CoreV1Api()

    try:
        pods = v1.list_namespaced_pod(namespace=namespace)
        pod_list = [
            {
                "name": pod.metadata.name,
                "status": pod.status.phase,
                "ready": all(cs.ready for cs in pod.status.container_statuses) if pod.status.container_statuses else False
            }
            for pod in pods.items
        ]
        return {"pods": pod_list}
    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="Namespace not found")
        raise HTTPException(status_code=500, detail=str(e))


executor = ThreadPoolExecutor(max_workers=5)


def stream_pod_logs(namespace: str, pod_name: str, send_fn, error_fn):
    """Stream pod logs to WebSocket. Sends errors via error_fn."""
    try:
        logger.info(f"Starting log stream for pod {pod_name} in namespace {namespace}")

        try:
            config.load_incluster_config()
            logger.info("Using in-cluster config")
        except:
            config.load_kube_config()
            logger.info("Using local kubeconfig")

        v1 = client.CoreV1Api()

        # Verify pod exists first
        try:
            pod = v1.read_namespaced_pod(name=pod_name, namespace=namespace)
            logger.info(f"Found pod {pod_name}, status: {pod.status.phase}")
        except client.exceptions.ApiException as e:
            error_msg = f"Pod not found: {pod_name} in namespace {namespace}"
            logger.error(error_msg)
            error_fn(error_msg)
            return

        # Stream logs
        w = watch.Watch()
        try:
            logger.info(f"Starting log watch for {pod_name}")
            for line in w.stream(
                v1.read_namespaced_pod_log,
                name=pod_name,
                namespace=namespace,
                follow=True,
                _preload_content=False
            ):
                # Handle both bytes and string responses
                if isinstance(line, bytes):
                    send_fn(line.decode("utf-8"))
                else:
                    send_fn(str(line))
        except client.exceptions.ApiException as e:
            error_msg = f"Kubernetes API error: {e.status} - {e.reason}"
            logger.error(error_msg)
            error_fn(error_msg)
        except Exception as e:
            error_msg = f"Error streaming logs: {type(e).__name__}: {str(e)}"
            logger.error(error_msg)
            error_fn(error_msg)
        finally:
            w.stop()
            logger.info(f"Stopped log stream for {pod_name}")
    except Exception as e:
        error_msg = f"Fatal error in stream_pod_logs: {type(e).__name__}: {str(e)}"
        logger.error(error_msg, exc_info=True)
        error_fn(error_msg)


@app.websocket("/ws/logs/{namespace}/{pod_name}")
async def websocket_logs(websocket: WebSocket, namespace: str, pod_name: str):
    """WebSocket endpoint for streaming pod logs with authentication"""
    # Authenticate WebSocket connection first
    try:
        user_info = await authenticate_websocket(websocket)
    except Exception as e:
        logger.warning(f"WebSocket authentication failed: {e}")
        return

    # Verify the user has access to this namespace
    expected_namespace = f"server-{user_info['user_id']}"
    if namespace != expected_namespace:
        logger.warning(f"User {user_info['sub']} attempted to access namespace {namespace}, expected {expected_namespace}")
        await websocket.close(code=4003)  # Custom code for forbidden
        return

    logger.info(f"WebSocket connection request for {namespace}/{pod_name} by user {user_info['sub']}")

    await websocket.accept()
    logger.info(f"WebSocket connection accepted for {namespace}/{pod_name}")

    loop = asyncio.get_event_loop()
    stream_active = True

    # Function to safely send messages from thread
    def send_fn(msg):
        try:
            future = asyncio.run_coroutine_threadsafe(websocket.send_text(msg), loop)
            future.result(timeout=5)  # Wait up to 5 seconds
        except Exception as e:
            logger.error(f"Error sending message: {e}")

    # Function to send errors to client
    def error_fn(error_msg):
        nonlocal stream_active
        stream_active = False
        try:
            future = asyncio.run_coroutine_threadsafe(
                websocket.send_text(f"ERROR: {error_msg}\n"),
                loop
            )
            future.result(timeout=5)
        except Exception as e:
            logger.error(f"Error sending error message: {e}")

    # Run blocking stream in thread
    future = executor.submit(stream_pod_logs, namespace, pod_name, send_fn, error_fn)

    # Keep the connection alive and handle disconnections
    try:
        while stream_active:
            # Check if client is still connected by waiting for messages
            # This will raise WebSocketDisconnect if client disconnects
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
            except asyncio.TimeoutError:
                # No message received, connection still alive
                pass

            # Check if streaming thread has finished
            if future.done():
                logger.info("Streaming thread finished")
                break

    except WebSocketDisconnect:
        logger.info(f"Client disconnected from {namespace}/{pod_name}")
    except Exception as e:
        logger.error(f"WebSocket error: {type(e).__name__}: {e}")
    finally:
        logger.info(f"Closing WebSocket connection for {namespace}/{pod_name}")
        try:
            await websocket.close()
        except:
            pass
