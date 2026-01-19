import asyncio
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor

from dotenv import load_dotenv
import shutil
import tempfile
import zipfile
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from kubernetes import client, config, watch
from pydantic import BaseModel
from typing import Optional

from auth.dependencies import get_user_id, get_effective_user_id, require_admin, sanitize_user_id
from auth.websocket_auth import authenticate_websocket
from auth import auth0_management
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
    memory: str = "2G",
    version: str = "LATEST",
    user_id: str = Depends(get_effective_user_id)
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

    container = client.V1Container(
        name=game,
        image="itzg/minecraft-server",
        ports=[client.V1ContainerPort(container_port=25565)],
        env=[
            client.V1EnvVar(name="EULA", value="TRUE"),
            client.V1EnvVar(name="MEMORY", value=memory),
            client.V1EnvVar(name="VERSION", value=version),
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
def stop_server(user_id: str = Depends(get_effective_user_id)):
    """Stop the game server for the authenticated user"""
    namespace = f"server-{user_id}"
    k8s.scale_deployment(namespace, "minecraft", 0)
    return {"status": "stopped"}


@app.post("/gameserver/start")
def start_server(user_id: str = Depends(get_effective_user_id)):
    """Start the game server for the authenticated user"""
    namespace = f"server-{user_id}"
    k8s.scale_deployment(namespace, "minecraft", 1)
    return {"status": "started"}


@app.delete("/gameserver")
def delete_server(user_id: str = Depends(get_effective_user_id)):
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
def get_server(user_id: str = Depends(get_effective_user_id)):
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
def get_pods(user_id: str = Depends(get_effective_user_id)):
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
def get_metrics(user_id: str = Depends(get_effective_user_id)):
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


# Popular Minecraft plugins with their Modrinth project slugs
POPULAR_PLUGINS = [
    {"id": "essentialsx", "modrinth_id": "essentialsx", "name": "EssentialsX", "description": "Essential commands and features for any server"},
    {"id": "worldedit", "modrinth_id": "worldedit", "name": "WorldEdit", "description": "In-game map editor for building and terrain manipulation"},
    {"id": "vault", "modrinth_id": "vault", "name": "Vault", "description": "Permission, chat, and economy API"},
    {"id": "luckperms", "modrinth_id": "luckperms", "name": "LuckPerms", "description": "Advanced permissions management system"},
    {"id": "worldguard", "modrinth_id": "worldguard", "name": "WorldGuard", "description": "Region protection and flag management"},
    {"id": "coreprotect", "modrinth_id": "coreprotect", "name": "CoreProtect", "description": "Block logging and rollback tool"},
    {"id": "chunky", "modrinth_id": "chunky", "name": "Chunky", "description": "Pre-generate chunks to improve server performance"},
    {"id": "spark", "modrinth_id": "spark", "name": "Spark", "description": "Performance profiler for Minecraft servers"},
]


@app.post("/gameserver/op/{player_name}")
def op_player(player_name: str, user_id: str = Depends(get_effective_user_id)):
    """Give operator permissions to a player"""
    from kubernetes.stream import stream

    # Validate player name (alphanumeric and underscore only, 3-16 chars)
    if not player_name or len(player_name) < 3 or len(player_name) > 16:
        raise HTTPException(status_code=400, detail="Invalid player name length (must be 3-16 characters)")
    if not all(c.isalnum() or c == '_' for c in player_name):
        raise HTTPException(status_code=400, detail="Invalid player name (alphanumeric and underscore only)")

    namespace = f"server-{user_id}"

    try:
        config.load_incluster_config()
    except:
        config.load_kube_config()

    v1 = client.CoreV1Api()

    try:
        # Find the minecraft pod
        pods = v1.list_namespaced_pod(namespace=namespace, label_selector="app=minecraft")
        if not pods.items:
            raise HTTPException(status_code=404, detail="No minecraft pod found")

        pod_name = pods.items[0].metadata.name

        # Execute rcon-cli op command
        exec_command = ['rcon-cli', 'op', player_name]
        result = stream(
            v1.connect_get_namespaced_pod_exec,
            pod_name,
            namespace,
            command=exec_command,
            container='minecraft',
            stderr=True,
            stdin=False,
            stdout=True,
            tty=False
        )

        logger.info(f"OP command result for {player_name}: {result}")
        return {"status": "success", "message": f"Opped {player_name}", "output": result}
    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="Server not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to op player: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/gameserver/plugins/available")
def get_available_plugins():
    """Get list of available plugins that can be installed"""
    return {"plugins": POPULAR_PLUGINS}


@app.get("/gameserver/plugins")
def get_installed_plugins(user_id: str = Depends(get_effective_user_id)):
    """Get list of plugins installed on the user's server"""
    namespace = f"server-{user_id}"

    try:
        config.load_incluster_config()
    except:
        config.load_kube_config()

    apps = client.AppsV1Api()

    try:
        deployment = apps.read_namespaced_deployment(name="minecraft", namespace=namespace)
        containers = deployment.spec.template.spec.containers

        installed_ids = []
        for container in containers:
            if container.name == "minecraft" and container.env:
                for env in container.env:
                    if env.name == "MODRINTH_PROJECTS":
                        installed_ids = [id.strip() for id in env.value.split(",") if id.strip()]
                        break

        # Map modrinth IDs back to plugin info
        installed_plugins = []
        for plugin in POPULAR_PLUGINS:
            if plugin["modrinth_id"] in installed_ids:
                installed_plugins.append(plugin)

        return {"plugins": installed_plugins}
    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="Server not found")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/gameserver/plugins/{plugin_id}")
def install_plugin(plugin_id: str, user_id: str = Depends(get_effective_user_id)):
    """Install a plugin on the user's server"""
    # Find the plugin
    plugin = next((p for p in POPULAR_PLUGINS if p["id"] == plugin_id), None)
    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found")

    namespace = f"server-{user_id}"

    try:
        config.load_incluster_config()
    except:
        config.load_kube_config()

    apps = client.AppsV1Api()

    try:
        deployment = apps.read_namespaced_deployment(name="minecraft", namespace=namespace)

        # Get current MODRINTH_PROJECTS value
        current_ids = []
        container_idx = None
        env_idx = None

        for i, container in enumerate(deployment.spec.template.spec.containers):
            if container.name == "minecraft":
                container_idx = i
                if container.env:
                    for j, env in enumerate(container.env):
                        if env.name == "MODRINTH_PROJECTS":
                            current_ids = [id.strip() for id in env.value.split(",") if id.strip()]
                            env_idx = j
                            break
                break

        if container_idx is None:
            raise HTTPException(status_code=500, detail="Minecraft container not found")

        # Add plugin if not already installed
        if plugin["modrinth_id"] not in current_ids:
            current_ids.append(plugin["modrinth_id"])

        new_value = ",".join(current_ids)

        # Update or add the environment variable
        if env_idx is not None:
            deployment.spec.template.spec.containers[container_idx].env[env_idx].value = new_value
        else:
            if deployment.spec.template.spec.containers[container_idx].env is None:
                deployment.spec.template.spec.containers[container_idx].env = []
            deployment.spec.template.spec.containers[container_idx].env.append(
                client.V1EnvVar(name="MODRINTH_PROJECTS", value=new_value)
            )

        # Apply the update
        apps.patch_namespaced_deployment(name="minecraft", namespace=namespace, body=deployment)

        return {"status": "installed", "plugin": plugin, "message": "Restart your server to apply changes"}
    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="Server not found")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/gameserver/plugins/{plugin_id}")
def uninstall_plugin(plugin_id: str, user_id: str = Depends(get_effective_user_id)):
    """Uninstall a plugin from the user's server"""
    # Find the plugin
    plugin = next((p for p in POPULAR_PLUGINS if p["id"] == plugin_id), None)
    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found")

    namespace = f"server-{user_id}"

    try:
        config.load_incluster_config()
    except:
        config.load_kube_config()

    apps = client.AppsV1Api()

    try:
        deployment = apps.read_namespaced_deployment(name="minecraft", namespace=namespace)

        # Get current MODRINTH_PROJECTS value
        container_idx = None
        env_idx = None
        current_ids = []

        for i, container in enumerate(deployment.spec.template.spec.containers):
            if container.name == "minecraft":
                container_idx = i
                if container.env:
                    for j, env in enumerate(container.env):
                        if env.name == "MODRINTH_PROJECTS":
                            current_ids = [id.strip() for id in env.value.split(",") if id.strip()]
                            env_idx = j
                            break
                break

        if container_idx is None:
            raise HTTPException(status_code=500, detail="Minecraft container not found")

        # Remove plugin
        if plugin["modrinth_id"] in current_ids:
            current_ids.remove(plugin["modrinth_id"])

        if env_idx is not None:
            if current_ids:
                deployment.spec.template.spec.containers[container_idx].env[env_idx].value = ",".join(current_ids)
            else:
                # Remove the env var if no plugins left
                deployment.spec.template.spec.containers[container_idx].env.pop(env_idx)

            # Apply the update
            apps.patch_namespaced_deployment(name="minecraft", namespace=namespace, body=deployment)

        return {"status": "uninstalled", "plugin": plugin, "message": "Restart your server to apply changes"}
    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="Server not found")
        raise HTTPException(status_code=500, detail=str(e))


# Maximum upload size: 500MB
MAX_UPLOAD_SIZE = 500 * 1024 * 1024


@app.post("/gameserver/world/upload")
async def upload_world(file: UploadFile = File(...), user_id: str = Depends(get_effective_user_id)):
    """Upload a world save to the user's Minecraft server.

    The server must be stopped before uploading a world.
    Accepts a .zip file containing the world folder.
    """
    from kubernetes.stream import stream
    import tarfile
    import io

    namespace = f"server-{user_id}"

    # Validate file extension
    if not file.filename or not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="File must be a .zip file")

    # Check file size by reading in chunks
    temp_dir = tempfile.mkdtemp()
    temp_zip_path = os.path.join(temp_dir, "world.zip")

    try:
        # Save uploaded file to temp location
        total_size = 0
        with open(temp_zip_path, 'wb') as f:
            while chunk := await file.read(1024 * 1024):  # Read 1MB at a time
                total_size += len(chunk)
                if total_size > MAX_UPLOAD_SIZE:
                    raise HTTPException(status_code=413, detail="File too large. Maximum size is 500MB")
                f.write(chunk)

        logger.info(f"Received world upload: {file.filename}, size: {total_size} bytes")

        # Validate zip file
        if not zipfile.is_zipfile(temp_zip_path):
            raise HTTPException(status_code=400, detail="Invalid zip file")

        # Extract and validate world structure
        extract_dir = os.path.join(temp_dir, "extracted")
        os.makedirs(extract_dir)

        with zipfile.ZipFile(temp_zip_path, 'r') as zip_ref:
            # Security: Check for path traversal attacks
            for member in zip_ref.namelist():
                member_path = os.path.normpath(member)
                if member_path.startswith('..') or os.path.isabs(member_path):
                    raise HTTPException(status_code=400, detail="Invalid zip file: contains unsafe paths")
            zip_ref.extractall(extract_dir)

        # Find the world folder (look for level.dat)
        world_folder = None
        for root, dirs, files in os.walk(extract_dir):
            if 'level.dat' in files:
                world_folder = root
                break

        if not world_folder:
            raise HTTPException(status_code=400, detail="Invalid world: no level.dat found. Make sure you're uploading a valid Minecraft world.")

        logger.info(f"Found valid world at: {world_folder}")

        # Load kubernetes config
        try:
            config.load_incluster_config()
        except:
            config.load_kube_config()

        v1 = client.CoreV1Api()
        apps = client.AppsV1Api()

        # Check if server exists and is stopped
        try:
            deployment = apps.read_namespaced_deployment(name="minecraft", namespace=namespace)
            if deployment.spec.replicas > 0:
                raise HTTPException(status_code=400, detail="Server must be stopped before uploading a world. Please stop your server first.")
        except client.exceptions.ApiException as e:
            if e.status == 404:
                raise HTTPException(status_code=404, detail="Server not found. Create a server first.")
            raise

        # Create a temporary pod to copy the world files
        copy_pod_name = f"world-upload-{user_id[:20]}-{int(time.time())}"

        copy_pod = client.V1Pod(
            metadata=client.V1ObjectMeta(name=copy_pod_name),
            spec=client.V1PodSpec(
                restart_policy="Never",
                containers=[
                    client.V1Container(
                        name="copy",
                        image="busybox:latest",
                        command=["sleep", "300"],  # Keep alive for 5 minutes
                        volume_mounts=[
                            client.V1VolumeMount(
                                name="game-data",
                                mount_path="/data"
                            )
                        ]
                    )
                ],
                volumes=[
                    client.V1Volume(
                        name="game-data",
                        persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(
                            claim_name="minecraft-data"
                        )
                    )
                ]
            )
        )

        try:
            # Create the copy pod
            v1.create_namespaced_pod(namespace=namespace, body=copy_pod)
            logger.info(f"Created copy pod: {copy_pod_name}")

            # Wait for pod to be ready
            for _ in range(30):  # Wait up to 30 seconds
                pod = v1.read_namespaced_pod(name=copy_pod_name, namespace=namespace)
                if pod.status.phase == "Running":
                    break
                time.sleep(1)
            else:
                raise HTTPException(status_code=500, detail="Timeout waiting for copy pod to start")

            # Delete existing world folder
            exec_command = ['rm', '-rf', '/data/world']
            stream(
                v1.connect_get_namespaced_pod_exec,
                copy_pod_name,
                namespace,
                command=exec_command,
                container='copy',
                stderr=True,
                stdin=False,
                stdout=True,
                tty=False
            )
            logger.info("Deleted existing world folder")

            # Create tar archive of the world folder
            tar_buffer = io.BytesIO()
            with tarfile.open(fileobj=tar_buffer, mode='w') as tar:
                tar.add(world_folder, arcname='world')
            tar_buffer.seek(0)
            tar_data = tar_buffer.read()

            # Copy via exec with tar
            exec_command = ['tar', 'xf', '-', '-C', '/data']
            resp = stream(
                v1.connect_get_namespaced_pod_exec,
                copy_pod_name,
                namespace,
                command=exec_command,
                container='copy',
                stderr=True,
                stdin=True,
                stdout=True,
                tty=False,
                _preload_content=False
            )

            # Send tar data
            resp.write_stdin(tar_data)
            resp.close()

            logger.info("World files copied successfully")

            return {"status": "success", "message": "World uploaded successfully. Start your server to play!"}

        finally:
            # Clean up the copy pod
            try:
                v1.delete_namespaced_pod(name=copy_pod_name, namespace=namespace)
                logger.info(f"Deleted copy pod: {copy_pod_name}")
            except:
                pass

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"World upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
    finally:
        # Clean up temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)


# ===================================
# Admin Endpoints
# ===================================

class ImpersonateRequest(BaseModel):
    user_id: str


class ImpersonateResponse(BaseModel):
    user_id: str
    sanitized_id: str
    email: Optional[str] = None
    is_admin: bool


@app.get("/admin/users")
def admin_list_users(
    search: str = Query("", description="Search query for users"),
    page: int = Query(0, ge=0, description="Page number"),
    per_page: int = Query(50, ge=1, le=100, description="Users per page"),
    admin_user: dict = Depends(require_admin)
):
    """List users from Auth0. Requires admin role."""
    try:
        result = auth0_management.list_users(search=search, page=page, per_page=per_page)

        # Enhance user data with admin status
        users_with_roles = []
        for user in result["users"]:
            user_id = user.get("user_id", "")
            is_admin = auth0_management.is_user_admin(user_id)
            users_with_roles.append({
                **user,
                "is_admin": is_admin,
                "sanitized_id": sanitize_user_id(user_id)
            })

        return {
            "users": users_with_roles,
            "total": result["total"],
            "page": result["page"],
            "per_page": result["per_page"]
        }
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        raise HTTPException(status_code=500, detail="Failed to list users")


@app.post("/admin/impersonate", response_model=ImpersonateResponse)
def admin_impersonate(
    request: ImpersonateRequest,
    admin_user: dict = Depends(require_admin)
):
    """
    Validate and prepare impersonation of a user.
    Returns the user info if impersonation is allowed.
    """
    target_user_id = request.user_id

    # Check if target user is an admin
    if auth0_management.is_user_admin(target_user_id):
        logger.warning(
            f"Admin {admin_user['sub']} attempted to impersonate admin user {target_user_id}"
        )
        raise HTTPException(status_code=403, detail="Cannot impersonate admin users")

    # Get user details from Auth0
    try:
        result = auth0_management.list_users(search=target_user_id, per_page=1)
        users = result.get("users", [])

        # Find exact match
        target_user = None
        for user in users:
            if user.get("user_id") == target_user_id:
                target_user = user
                break

        if not target_user:
            # Try to get user directly
            target_user = {"user_id": target_user_id, "email": None}

    except Exception as e:
        logger.error(f"Error fetching user {target_user_id}: {e}")
        target_user = {"user_id": target_user_id, "email": None}

    # Log the impersonation start
    logger.info(
        f"IMPERSONATION START: Admin {admin_user['sub']} ({admin_user.get('email', 'unknown')}) "
        f"is starting impersonation of user {target_user_id}"
    )

    return ImpersonateResponse(
        user_id=target_user_id,
        sanitized_id=sanitize_user_id(target_user_id),
        email=target_user.get("email"),
        is_admin=False
    )


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

    # Verify the user has access to this namespace (using effective_user_id for impersonation support)
    expected_namespace = f"server-{user_info['effective_user_id']}"
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
