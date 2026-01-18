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
from k8s.velocity_manager import VelocityManager
from models.game_models import GameServerResponse

load_dotenv()

# Minecraft hostname configuration
# Players connect via {user_id}.{MC_HOSTNAME_BASE}
MC_HOSTNAME_BASE = os.getenv("MC_HOSTNAME_BASE", "infinabyte.com")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
k8s = K8sManager()
velocity = VelocityManager()

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
    memory: str = "3G",
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
    # Init container to configure Paper for Velocity forwarding
    init_container = client.V1Container(
        name="configure-velocity",
        image="busybox:latest",
        command=["sh", "-c", """
mkdir -p /data/config
cat > /data/config/paper-global.yml << 'EOF'
_version: 29
proxies:
  velocity:
    enabled: true
    online-mode: true
    secret: REDACTED
EOF
echo "Paper Velocity config written"
"""],
        volume_mounts=[
            client.V1VolumeMount(
                name="game-data",
                mount_path="/data",
            )
        ],
    )

    # Convert memory format (e.g., "2G" -> "2Gi" for Kubernetes)
    memory_k8s = memory.replace("G", "Gi").replace("M", "Mi")

    container = client.V1Container(
        name=game,
        image="itzg/minecraft-server",
        ports=[client.V1ContainerPort(container_port=25565)],
        env=[
            client.V1EnvVar(name="EULA", value="TRUE"),
            client.V1EnvVar(name="MEMORY", value=memory),
            # Velocity proxy configuration
            client.V1EnvVar(name="ONLINE_MODE", value="FALSE"),
            client.V1EnvVar(name="TYPE", value="PAPER"),
        ],
        volume_mounts=[
            client.V1VolumeMount(
                name="game-data",
                mount_path="/data",
            )
        ],
        resources=client.V1ResourceRequirements(
            requests={"memory": memory_k8s},
            limits={"memory": memory_k8s}
        ),
    )

    template = client.V1PodTemplateSpec(
        metadata=client.V1ObjectMeta(labels={"app": game}),
        spec=client.V1PodSpec(
            init_containers=[init_container],
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
    # Create Service (ClusterIP - accessed via Velocity proxy)
    # ---------------------------
    service = client.V1Service(
        metadata=client.V1ObjectMeta(name=f"{game}-service"),
        spec=client.V1ServiceSpec(
            type="ClusterIP",
            selector={"app": game},
            ports=[client.V1ServicePort(port=25565, target_port=25565)],
        ),
    )

    v1.create_namespaced_service(namespace=namespace, body=service)

    # ---------------------------
    # Register with Velocity Proxy
    # ---------------------------
    hostname = f"{user_id}.{MC_HOSTNAME_BASE}"
    try:
        velocity.register_server(user_id, namespace, hostname)
        logger.info(f"Registered server with Velocity: {hostname}")
    except Exception as e:
        logger.error(f"Failed to register with Velocity: {e}")
        # Continue anyway - server is created, just not routed yet

    return {
        "namespace": namespace,
        "hostname": hostname,
        "port": 25565,
        "status": "ready"
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
    hostname = f"{user_id}.{MC_HOSTNAME_BASE}"

    # Unregister from Velocity proxy
    try:
        velocity.unregister_server(user_id, hostname)
        logger.info(f"Unregistered server from Velocity: {hostname}")
    except Exception as e:
        logger.error(f"Failed to unregister from Velocity: {e}")

    # Delete PVC explicitly to ensure clean state for next creation
    try:
        config.load_incluster_config()
    except:
        config.load_kube_config()

    v1 = client.CoreV1Api()
    try:
        # Delete the PVC first to ensure data is wiped
        v1.delete_namespaced_persistent_volume_claim(
            name="minecraft-data",
            namespace=namespace,
            body=client.V1DeleteOptions(propagation_policy="Foreground")
        )
        logger.info(f"Deleted PVC minecraft-data in namespace {namespace}")
    except client.exceptions.ApiException as e:
        if e.status != 404:
            logger.error(f"Failed to delete PVC: {e}")

    k8s.delete_namespace(namespace)
    return {"status": "deleted"}


@app.get("/gameserver")
def get_server(user_id: str = Depends(get_user_id)):
    """Get existing server information for the authenticated user"""
    namespace = f"server-{user_id}"
    hostname = f"{user_id}.{MC_HOSTNAME_BASE}"

    try:
        config.load_incluster_config()
    except:
        config.load_kube_config()

    v1 = client.CoreV1Api()
    apps = client.AppsV1Api()

    try:
        # Check if namespace exists
        v1.read_namespace(namespace)
    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="No server found")
        raise HTTPException(status_code=500, detail=str(e))

    # Check deployment status
    try:
        deployment = apps.read_namespaced_deployment(name="minecraft", namespace=namespace)
        replicas = deployment.spec.replicas or 0
        ready_replicas = deployment.status.ready_replicas or 0

        if replicas == 0:
            status = "stopped"
        elif ready_replicas >= replicas:
            status = "ready"
        else:
            status = "starting"

        return {
            "namespace": namespace,
            "hostname": hostname,
            "port": 25565,
            "status": status
        }
    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="Server deployment not found")
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


PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090")


@app.get("/gameserver/metrics")
def get_metrics(user_id: str = Depends(get_user_id)):
    """Get resource metrics (RAM usage) for the authenticated user's game server"""
    import httpx

    namespace = f"server-{user_id}"

    # Query Prometheus for container memory usage
    query = f'container_memory_working_set_bytes{{namespace="{namespace}", container="minecraft"}}'

    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{PROMETHEUS_URL}/api/v1/query",
                params={"query": query}
            )
            response.raise_for_status()
            data = response.json()

            pod_metrics = []
            if data.get("status") == "success":
                results = data.get("data", {}).get("result", [])
                for result in results:
                    metric = result.get("metric", {})
                    value = result.get("value", [None, "0"])
                    memory_bytes = int(float(value[1])) if len(value) > 1 else 0

                    pod_metrics.append({
                        "pod": metric.get("pod", "unknown"),
                        "container": metric.get("container", "minecraft"),
                        "memory_bytes": memory_bytes,
                        "memory_human": format_bytes(memory_bytes)
                    })

            return {"metrics": pod_metrics}
    except httpx.HTTPError as e:
        logger.error(f"Failed to query Prometheus: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch metrics from Prometheus")
    except Exception as e:
        logger.error(f"Error fetching metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def format_bytes(bytes_val: int) -> str:
    """Format bytes to human-readable string"""
    if bytes_val >= 1024 ** 3:
        return f"{bytes_val / (1024 ** 3):.1f} GB"
    elif bytes_val >= 1024 ** 2:
        return f"{bytes_val / (1024 ** 2):.1f} MB"
    elif bytes_val >= 1024:
        return f"{bytes_val / 1024:.1f} KB"
    return f"{bytes_val} B"


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
