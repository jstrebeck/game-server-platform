import asyncio
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor

from dotenv import load_dotenv
import shutil
import tempfile
import zipfile
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, UploadFile, File, Query, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from kubernetes import client, config, watch
from pydantic import BaseModel
from typing import Optional

from auth.dependencies import get_user_id, get_effective_user_id, require_admin, sanitize_user_id, get_current_user
from auth.websocket_auth import authenticate_websocket
from auth import auth0_management
from k8s.k8s_manager import K8sManager
from k8s.velocity_manager import VelocityManager
from models.game_models import GameServerResponse
from billing.models import SubscriptionStatus, CheckoutResponse, PortalResponse, CheckoutRequest, AvailablePlansResponse, PlanInfo, PLANS, UpgradeResponse
from billing import stripe_service, subscription, webhook_handler

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
    version: str = "LATEST",
    user_id: str = Depends(get_effective_user_id),
    current_user: dict = Depends(get_current_user)
):
    """Create a new game server for the authenticated user"""
    # Start trial for new users who haven't started one yet
    full_user_id = current_user.get("sub")
    if not subscription.has_started_trial(full_user_id):
        subscription.start_trial(full_user_id)
        logger.info(f"Started 48-hour trial for new user {full_user_id}")

    # Get the user's plan memory allocation
    status = subscription.get_subscription_status(full_user_id)
    memory = status.memory or "2G"
    logger.info(f"Creating server for user {full_user_id} with {memory} RAM (plan: {status.plan_id})")
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

    # Convert memory format for Kubernetes (e.g., "2G" -> "2Gi")
    memory_limit = memory.replace("G", "Gi")

    # Calculate JVM heap size (reserve 512MB for JVM overhead: metaspace, native memory, GC)
    memory_gb = int(memory.replace("G", ""))
    max_heap_mb = memory_gb * 1024 - 512
    # Start with ~33% of max heap (minimum 512MB) so metrics show actual usage, not pre-allocated
    init_heap_mb = max(512, max_heap_mb // 3)

    container = client.V1Container(
        name=game,
        image="itzg/minecraft-server",
        ports=[client.V1ContainerPort(container_port=25565)],
        env=[
            client.V1EnvVar(name="EULA", value="TRUE"),
            client.V1EnvVar(name="INIT_MEMORY", value=f"{init_heap_mb}M"),
            client.V1EnvVar(name="MAX_MEMORY", value=f"{max_heap_mb}M"),
            client.V1EnvVar(name="USE_AIKAR_FLAGS", value="TRUE"),
            client.V1EnvVar(name="VERSION", value=version),
            # Velocity proxy configuration
            client.V1EnvVar(name="ONLINE_MODE", value="FALSE"),
            client.V1EnvVar(name="TYPE", value="PAPER"),
            # Server icon
            client.V1EnvVar(name="ICON", value="https://minecrafthosting.gg/server-icon.png"),
        ],
        volume_mounts=[
            client.V1VolumeMount(
                name="game-data",
                mount_path="/data",
            )
        ],
        resources=client.V1ResourceRequirements(
            limits={"memory": memory_limit},
            requests={"memory": memory_limit}
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
        "status": "ready",
        "version": version
    }


@app.post("/gameserver/stop")
def stop_server(user_id: str = Depends(get_effective_user_id)):
    """Stop the game server for the authenticated user"""
    namespace = f"server-{user_id}"
    k8s.scale_deployment(namespace, "minecraft", 0)
    return {"status": "stopped"}


@app.post("/gameserver/start")
async def start_server(
    user_id: str = Depends(get_effective_user_id),
    current_user: dict = Depends(subscription.require_active_subscription)
):
    """Start the game server for the authenticated user. Requires active subscription or trial."""
    namespace = f"server-{user_id}"

    # Get the user's plan memory allocation
    full_user_id = current_user.get("sub")
    status = subscription.get_subscription_status(full_user_id)
    memory = status.memory or "2G"

    # Update the deployment's memory allocation before starting
    try:
        config.load_incluster_config()
    except:
        config.load_kube_config()

    apps = client.AppsV1Api()

    try:
        # Patch the deployment to update memory
        deployment = apps.read_namespaced_deployment(name="minecraft", namespace=namespace)

        # Convert memory format for Kubernetes (e.g., "2G" -> "2Gi")
        memory_limit = memory.replace("G", "Gi")

        # Calculate JVM heap size (reserve 512MB for JVM overhead: metaspace, native memory, GC)
        memory_gb = int(memory.replace("G", ""))
        max_heap_mb = memory_gb * 1024 - 512
        # Start with ~33% of max heap (minimum 512MB) so metrics show actual usage
        init_heap_mb = max(512, max_heap_mb // 3)

        # Find and update env vars and resource limits
        for container in deployment.spec.template.spec.containers:
            if container.name == "minecraft":
                if container.env:
                    # Track which vars we've updated
                    found_init = False
                    found_max = False
                    env_to_remove = []

                    for i, env in enumerate(container.env):
                        if env.name == "INIT_MEMORY":
                            env.value = f"{init_heap_mb}M"
                            found_init = True
                        elif env.name == "MAX_MEMORY":
                            env.value = f"{max_heap_mb}M"
                            found_max = True
                        elif env.name == "MEMORY":
                            # Remove old MEMORY var (replaced by INIT/MAX)
                            env_to_remove.append(i)

                    # Remove old MEMORY vars (in reverse order to preserve indices)
                    for i in reversed(env_to_remove):
                        container.env.pop(i)

                    # Add missing env vars
                    if not found_init:
                        container.env.append(client.V1EnvVar(name="INIT_MEMORY", value=f"{init_heap_mb}M"))
                    if not found_max:
                        container.env.append(client.V1EnvVar(name="MAX_MEMORY", value=f"{max_heap_mb}M"))

                # Update resource limits
                if container.resources is None:
                    container.resources = client.V1ResourceRequirements()
                container.resources.limits = {"memory": memory_limit}
                container.resources.requests = {"memory": memory_limit}

        apps.patch_namespaced_deployment(name="minecraft", namespace=namespace, body=deployment)
        logger.info(f"Updated memory: plan={memory}, init={init_heap_mb}M, max={max_heap_mb}M, limit={memory_limit} for user {user_id}")
    except client.exceptions.ApiException as e:
        logger.error(f"Failed to update memory: {e}")
        # Continue anyway - server will start with previous memory setting

    k8s.scale_deployment(namespace, "minecraft", 1)
    return {"status": "started", "memory": memory}


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

        # Extract version from deployment env vars
        version = "Unknown"
        containers = deployment.spec.template.spec.containers
        for container in containers:
            if container.name == "minecraft" and container.env:
                for env in container.env:
                    if env.name == "VERSION":
                        version = env.value
                        break
                break

        return {
            "namespace": namespace,
            "hostname": hostname,
            "port": 25565,
            "status": status,
            "version": version
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


class ConsoleCommand(BaseModel):
    command: str


# Blocked commands that should use UI controls instead
BLOCKED_CONSOLE_COMMANDS = {'stop', 'shutdown', 'restart', 'end', 'quit'}

# Allowed config files for editing (whitelist for security)
ALLOWED_CONFIG_FILES = {
    'server.properties': '/data/server.properties',
    'bukkit.yml': '/data/bukkit.yml',
    'spigot.yml': '/data/spigot.yml',
    'paper.yml': '/data/paper.yml',
    'paper-global.yml': '/data/config/paper-global.yml',
    'ops.json': '/data/ops.json',
    'whitelist.json': '/data/whitelist.json',
}

# Maximum config file size (1MB)
MAX_CONFIG_FILE_SIZE = 1 * 1024 * 1024


@app.post("/gameserver/console")
def execute_console_command(
    body: ConsoleCommand,
    user_id: str = Depends(get_effective_user_id),
    current_user: dict = Depends(get_current_user)
):
    """Execute a console command on the user's Minecraft server via RCON"""
    from kubernetes.stream import stream

    command = body.command.strip()

    # Validate command
    if not command:
        raise HTTPException(status_code=400, detail="Command cannot be empty")
    if len(command) > 500:
        raise HTTPException(status_code=400, detail="Command too long (max 500 characters)")

    # Check for blocked commands
    first_word = command.split()[0].lower()
    if first_word in BLOCKED_CONSOLE_COMMANDS:
        raise HTTPException(
            status_code=400,
            detail=f"The '{first_word}' command is blocked. Please use the UI controls to stop/restart your server."
        )

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

        pod = pods.items[0]
        pod_name = pod.metadata.name

        # Check if pod is running
        if pod.status.phase != "Running":
            raise HTTPException(
                status_code=400,
                detail=f"Server is not running (status: {pod.status.phase})"
            )

        # Execute via rcon-cli
        exec_command = ['rcon-cli', command]
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

        # Log the command for audit
        logger.info(f"Console command by user {current_user.get('sub')}: '{command}' -> {result}")

        return {
            "status": "success",
            "command": command,
            "output": result.strip() if result else "Command executed (no output)"
        }

    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="Server not found")
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to execute console command: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ConfigFileContent(BaseModel):
    content: str


@app.get("/gameserver/config")
def list_config_files(
    user_id: str = Depends(get_effective_user_id),
    current_user: dict = Depends(get_current_user)
):
    """List available config files and check which ones exist on the server."""
    from kubernetes.stream import stream

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

        pod = pods.items[0]
        pod_name = pod.metadata.name

        # Check if pod is running
        if pod.status.phase != "Running":
            raise HTTPException(
                status_code=400,
                detail=f"Server is not running (status: {pod.status.phase}). Start the server to edit config files."
            )

        # Check which files exist
        existing_files = []
        for filename, filepath in ALLOWED_CONFIG_FILES.items():
            try:
                exec_command = ['test', '-f', filepath, '&&', 'echo', 'exists']
                result = stream(
                    v1.connect_get_namespaced_pod_exec,
                    pod_name,
                    namespace,
                    command=['sh', '-c', f'test -f {filepath} && echo exists'],
                    container='minecraft',
                    stderr=True,
                    stdin=False,
                    stdout=True,
                    tty=False
                )
                if result.strip() == 'exists':
                    existing_files.append({'name': filename, 'path': filepath})
            except Exception:
                pass  # File doesn't exist or error checking

        logger.info(f"Config files listed for user {current_user.get('sub')}: {[f['name'] for f in existing_files]}")

        return {"files": existing_files}

    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="Server not found")
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list config files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/gameserver/config/{filename}")
def read_config_file(
    filename: str,
    user_id: str = Depends(get_effective_user_id),
    current_user: dict = Depends(get_current_user)
):
    """Read the contents of a config file."""
    from kubernetes.stream import stream

    # Security: validate filename against whitelist
    safe_filename = os.path.basename(filename)
    if safe_filename not in ALLOWED_CONFIG_FILES:
        raise HTTPException(status_code=400, detail=f"File '{filename}' is not allowed")

    filepath = ALLOWED_CONFIG_FILES[safe_filename]
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

        pod = pods.items[0]
        pod_name = pod.metadata.name

        # Check if pod is running
        if pod.status.phase != "Running":
            raise HTTPException(
                status_code=400,
                detail=f"Server is not running (status: {pod.status.phase}). Start the server to edit config files."
            )

        # Read file contents using cat
        exec_command = ['cat', filepath]
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

        logger.info(f"Config file '{safe_filename}' read by user {current_user.get('sub')}")

        return {"filename": safe_filename, "content": result}

    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="Server not found")
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to read config file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/gameserver/config/{filename}")
def write_config_file(
    filename: str,
    body: ConfigFileContent,
    user_id: str = Depends(get_effective_user_id),
    current_user: dict = Depends(get_current_user)
):
    """Write contents to a config file."""
    from kubernetes.stream import stream

    # Security: validate filename against whitelist
    safe_filename = os.path.basename(filename)
    if safe_filename not in ALLOWED_CONFIG_FILES:
        raise HTTPException(status_code=400, detail=f"File '{filename}' is not allowed")

    # Security: check content size
    if len(body.content) > MAX_CONFIG_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File content too large. Maximum size is {MAX_CONFIG_FILE_SIZE // 1024}KB")

    filepath = ALLOWED_CONFIG_FILES[safe_filename]
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

        pod = pods.items[0]
        pod_name = pod.metadata.name

        # Check if pod is running
        if pod.status.phase != "Running":
            raise HTTPException(
                status_code=400,
                detail=f"Server is not running (status: {pod.status.phase}). Start the server to edit config files."
            )

        # Ensure parent directory exists
        parent_dir = os.path.dirname(filepath)
        if parent_dir and parent_dir != '/data':
            mkdir_command = ['mkdir', '-p', parent_dir]
            stream(
                v1.connect_get_namespaced_pod_exec,
                pod_name,
                namespace,
                command=mkdir_command,
                container='minecraft',
                stderr=True,
                stdin=False,
                stdout=True,
                tty=False
            )

        # Write file contents using cat with stdin
        exec_command = ['sh', '-c', f'cat > {filepath}']
        resp = stream(
            v1.connect_get_namespaced_pod_exec,
            pod_name,
            namespace,
            command=exec_command,
            container='minecraft',
            stderr=True,
            stdin=True,
            stdout=True,
            tty=False,
            _preload_content=False
        )

        # Send the content
        resp.write_stdin(body.content)
        resp.close()

        logger.info(f"Config file '{safe_filename}' written by user {current_user.get('sub')} ({len(body.content)} bytes)")

        return {"status": "success", "filename": safe_filename, "message": f"File '{safe_filename}' saved successfully"}

    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="Server not found")
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to write config file: {e}")
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

            # Send tar data in chunks to avoid connection reset on large files
            chunk_size = 1024 * 1024  # 1MB chunks
            for i in range(0, len(tar_data), chunk_size):
                chunk = tar_data[i:i + chunk_size]
                resp.write_stdin(chunk)
            resp.close()

            logger.info("World files copied successfully")

            # Fix permissions - Minecraft server runs as UID 1000
            exec_command = ['chown', '-R', '1000:1000', '/data/world']
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
            logger.info("Fixed world folder permissions")

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


# Cluster capacity configuration (in GB)
CLUSTER_TOTAL_RAM_GB = int(os.getenv("CLUSTER_TOTAL_RAM_GB", "240"))


def get_cluster_allocated_gb() -> float:
    """Calculate total allocated RAM across all server namespaces. Returns GB."""
    try:
        config.load_incluster_config()
    except:
        config.load_kube_config()

    v1 = client.CoreV1Api()
    apps = client.AppsV1Api()

    namespaces = v1.list_namespace()
    server_namespaces = [
        ns.metadata.name for ns in namespaces.items
        if ns.metadata.name.startswith("server-")
    ]

    total_allocated_bytes = 0
    for ns in server_namespaces:
        try:
            deployments = apps.list_namespaced_deployment(namespace=ns)
            for dep in deployments.items:
                if dep.spec.replicas and dep.spec.replicas > 0:
                    for container in dep.spec.template.spec.containers:
                        if container.name == "minecraft" and container.resources and container.resources.limits:
                            memory_limit = container.resources.limits.get("memory", "0")
                            if memory_limit.endswith("Gi"):
                                total_allocated_bytes += int(memory_limit[:-2]) * 1024 ** 3
                            elif memory_limit.endswith("Mi"):
                                total_allocated_bytes += int(memory_limit[:-2]) * 1024 ** 2
        except client.exceptions.ApiException:
            continue

    return total_allocated_bytes / (1024 ** 3)


def get_cluster_remaining_gb() -> float:
    """Get remaining cluster capacity in GB."""
    allocated = get_cluster_allocated_gb()
    return CLUSTER_TOTAL_RAM_GB - allocated


def parse_memory_to_gb(memory_str: str) -> int:
    """Parse memory string like '2G', '4G' to integer GB value."""
    if memory_str.endswith("G"):
        return int(memory_str[:-1])
    elif memory_str.endswith("Gi"):
        return int(memory_str[:-2])
    return 0


class ClusterStatsResponse(BaseModel):
    cluster_capacity_gb: int
    total_allocated_gb: float
    total_used_gb: float
    remaining_gb: float
    active_servers: int
    usage_percent: float


@app.get("/admin/cluster-stats", response_model=ClusterStatsResponse)
def get_cluster_stats(admin_user: dict = Depends(require_admin)):
    """Get cluster-wide RAM statistics. Requires admin role."""
    import httpx

    try:
        config.load_incluster_config()
    except:
        config.load_kube_config()

    v1 = client.CoreV1Api()
    apps = client.AppsV1Api()

    # Get all namespaces starting with "server-"
    namespaces = v1.list_namespace()
    server_namespaces = [
        ns.metadata.name for ns in namespaces.items
        if ns.metadata.name.startswith("server-")
    ]

    total_allocated_bytes = 0
    active_servers = 0

    # Get allocated RAM from deployments in each namespace
    for ns in server_namespaces:
        try:
            deployments = apps.list_namespaced_deployment(namespace=ns)
            for dep in deployments.items:
                if dep.spec.replicas and dep.spec.replicas > 0:
                    active_servers += 1
                    # Get memory limit from container spec
                    for container in dep.spec.template.spec.containers:
                        if container.name == "minecraft" and container.resources and container.resources.limits:
                            memory_limit = container.resources.limits.get("memory", "0")
                            # Parse memory string (e.g., "2Gi", "4Gi")
                            if memory_limit.endswith("Gi"):
                                total_allocated_bytes += int(memory_limit[:-2]) * 1024 ** 3
                            elif memory_limit.endswith("Mi"):
                                total_allocated_bytes += int(memory_limit[:-2]) * 1024 ** 2
        except client.exceptions.ApiException:
            continue

    # Query Prometheus for actual used memory across all servers
    total_used_bytes = 0
    try:
        query = 'sum(container_memory_working_set_bytes{container="minecraft"})'
        with httpx.Client(timeout=5.0) as http_client:
            response = http_client.get(
                f"{PROMETHEUS_URL}/api/v1/query",
                params={"query": query}
            )
            response.raise_for_status()
            data = response.json()

            if data.get("status") == "success":
                results = data.get("data", {}).get("result", [])
                if results:
                    value = results[0].get("value", [None, "0"])
                    total_used_bytes = int(float(value[1])) if len(value) > 1 else 0
    except Exception as e:
        logger.warning(f"Failed to query Prometheus for cluster stats: {e}")

    # Calculate stats
    cluster_capacity_bytes = CLUSTER_TOTAL_RAM_GB * 1024 ** 3
    total_allocated_gb = total_allocated_bytes / (1024 ** 3)
    total_used_gb = total_used_bytes / (1024 ** 3)
    remaining_gb = CLUSTER_TOTAL_RAM_GB - total_allocated_gb

    usage_percent = (total_allocated_gb / CLUSTER_TOTAL_RAM_GB * 100) if CLUSTER_TOTAL_RAM_GB > 0 else 0

    return ClusterStatsResponse(
        cluster_capacity_gb=CLUSTER_TOTAL_RAM_GB,
        total_allocated_gb=round(total_allocated_gb, 1),
        total_used_gb=round(total_used_gb, 1),
        remaining_gb=round(remaining_gb, 1),
        active_servers=active_servers,
        usage_percent=round(usage_percent, 1)
    )


# ===================================
# Billing Endpoints
# ===================================


@app.get("/billing/status", response_model=SubscriptionStatus)
def get_billing_status(current_user: dict = Depends(get_current_user)):
    """Get the current subscription/trial status for the authenticated user."""
    user_id = current_user.get("sub")
    return subscription.get_subscription_status(user_id)


@app.get("/billing/plans", response_model=AvailablePlansResponse)
def get_available_plans():
    """Get the list of available subscription plans."""
    plans = [
        PlanInfo(plan_id=plan_id, display_name=plan["display_name"], memory=plan["memory"])
        for plan_id, plan in PLANS.items()
    ]
    return AvailablePlansResponse(plans=plans)


@app.post("/billing/checkout", response_model=CheckoutResponse)
def create_checkout(
    request: CheckoutRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create a Stripe Checkout session for subscription."""
    user_id = current_user.get("sub")
    email = current_user.get("email", "")
    plan_id = request.plan_id

    # Validate plan_id
    if plan_id not in PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan_id: {plan_id}")

    # Check cluster capacity
    plan_memory = PLANS[plan_id]["memory"]
    required_gb = parse_memory_to_gb(plan_memory)
    remaining_gb = get_cluster_remaining_gb()

    if remaining_gb < required_gb:
        logger.warning(f"Checkout blocked for user {user_id}: insufficient capacity")
        raise HTTPException(
            status_code=503,
            detail=f"Sorry, we're currently at capacity. Please try again later."
        )

    # Get existing customer ID from metadata or create new customer
    status = subscription.get_subscription_status(user_id)
    customer_id = stripe_service.get_or_create_customer(
        user_id,
        email,
        status.stripe_customer_id
    )

    # Update metadata with customer ID if new
    if not status.stripe_customer_id:
        auth0_management.update_user_metadata(user_id, {"stripe_customer_id": customer_id})

    # Create checkout session with selected plan
    result = stripe_service.create_checkout_session(customer_id, user_id, plan_id)

    return CheckoutResponse(
        checkout_url=result["checkout_url"],
        session_id=result["session_id"]
    )


@app.post("/billing/portal", response_model=PortalResponse)
def create_portal(current_user: dict = Depends(get_current_user)):
    """Create a Stripe Customer Portal session for managing subscription."""
    user_id = current_user.get("sub")

    # Get customer ID from metadata
    status = subscription.get_subscription_status(user_id)

    if not status.stripe_customer_id:
        raise HTTPException(
            status_code=400,
            detail="No billing account found. Please subscribe first."
        )

    portal_url = stripe_service.create_portal_session(status.stripe_customer_id)

    return PortalResponse(portal_url=portal_url)


@app.post("/billing/upgrade", response_model=UpgradeResponse)
def upgrade_plan(current_user: dict = Depends(get_current_user)):
    """Upgrade subscription to the next RAM tier."""
    user_id = current_user.get("sub")

    # Get current subscription status
    status = subscription.get_subscription_status(user_id)

    if status.subscription_status != "active":
        raise HTTPException(
            status_code=400,
            detail="You must have an active subscription to upgrade."
        )

    if not status.subscription_id:
        raise HTTPException(
            status_code=400,
            detail="No active subscription found."
        )

    current_plan = status.plan_id or "2gb"

    # Get next plan tier
    next_plan = stripe_service.get_next_plan(current_plan)

    if not next_plan:
        raise HTTPException(
            status_code=400,
            detail="You are already on the highest plan tier."
        )

    # Check cluster capacity for the additional RAM needed
    current_memory_gb = parse_memory_to_gb(PLANS[current_plan]["memory"])
    next_memory_gb = parse_memory_to_gb(PLANS[next_plan]["memory"])
    additional_gb_needed = next_memory_gb - current_memory_gb
    remaining_gb = get_cluster_remaining_gb()

    if remaining_gb < additional_gb_needed:
        logger.warning(f"Upgrade blocked for user {user_id}: insufficient capacity")
        raise HTTPException(
            status_code=503,
            detail=f"Sorry, we're currently at capacity. Please try again later."
        )

    # Upgrade the subscription in Stripe
    try:
        stripe_service.upgrade_subscription(status.subscription_id, next_plan, user_id)
    except Exception as e:
        logger.error(f"Failed to upgrade subscription: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to upgrade subscription. Please try again."
        )

    # Update user metadata with new plan
    from auth import auth0_management
    auth0_management.update_user_metadata(user_id, {"plan_id": next_plan})

    new_memory = PLANS[next_plan]["memory"]

    return UpgradeResponse(
        success=True,
        new_plan_id=next_plan,
        new_memory=new_memory,
        message=f"Successfully upgraded to {PLANS[next_plan]['display_name']}. Restart your server to apply the new RAM allocation."
    )


@app.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature")
):
    """
    Handle Stripe webhook events.
    This endpoint verifies the webhook signature and processes events.
    """
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")

    # Get raw body for signature verification
    payload = await request.body()

    try:
        event = stripe_service.construct_webhook_event(payload, stripe_signature)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except Exception as e:
        logger.error(f"Webhook signature verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Process the event
    result = webhook_handler.process_webhook_event(event)
    logger.info(f"Webhook processed: {event.type} -> {result}")

    return {"received": True, "result": result}


# ===================================
# Support Endpoint
# ===================================

MAILGUN_API_KEY = os.getenv("MAILGUN_API_KEY", "")
MAILGUN_DOMAIN = os.getenv("MAILGUN_DOMAIN", "")
MAILGUN_FROM_EMAIL = os.getenv("MAILGUN_FROM_EMAIL", "noreply@infinabyte.com")
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "support@infinabyte.com")


class SupportRequest(BaseModel):
    subject: str
    message: str
    user_email: Optional[str] = None


@app.post("/support")
def submit_support_request(
    request: SupportRequest,
    current_user: dict = Depends(get_current_user)
):
    """Submit a support request via email using Mailgun."""
    import httpx

    # Validate input
    if not request.subject or len(request.subject.strip()) == 0:
        raise HTTPException(status_code=400, detail="Subject is required")
    if len(request.subject) > 100:
        raise HTTPException(status_code=400, detail="Subject too long (max 100 characters)")
    if not request.message or len(request.message.strip()) == 0:
        raise HTTPException(status_code=400, detail="Message is required")
    if len(request.message) > 2000:
        raise HTTPException(status_code=400, detail="Message too long (max 2000 characters)")

    user_id = current_user.get("sub", "unknown")
    # Prefer email from request body (from frontend), fallback to token claim
    user_email = request.user_email or current_user.get("email") or "unknown"

    # Build email content
    email_subject = f"[Support Request] {request.subject}"
    email_body = f"""
New support request from Minecraft Hosting user:

User ID: {user_id}
User Email: {user_email}

Subject: {request.subject}

Message:
{request.message}

---
This is an automated message from the Minecraft Hosting support system.
"""

    # Check if Mailgun is configured
    if not MAILGUN_API_KEY or not MAILGUN_DOMAIN:
        # Log the support request if Mailgun is not configured
        logger.warning(f"Mailgun not configured. Support request from {user_email}: {request.subject}")
        logger.info(f"Support message: {request.message}")
        return {"status": "received", "message": "Support request logged (email not configured)"}

    try:
        # Send email via Mailgun API
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages",
                auth=("api", MAILGUN_API_KEY),
                data={
                    "from": f"Minecraft Hosting Support <{MAILGUN_FROM_EMAIL}>",
                    "to": SUPPORT_EMAIL,
                    "subject": email_subject,
                    "text": email_body,
                    "h:Reply-To": user_email if user_email != "unknown" else MAILGUN_FROM_EMAIL,
                }
            )
            response.raise_for_status()

        logger.info(f"Support email sent from user {user_id} ({user_email}): {request.subject}")
        return {"status": "sent", "message": "Support request submitted successfully"}

    except httpx.HTTPStatusError as e:
        logger.error(f"Mailgun API error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=500, detail="Failed to send email. Please try again later.")
    except httpx.RequestError as e:
        logger.error(f"Mailgun request error: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email. Please try again later.")
    except Exception as e:
        logger.error(f"Error sending support email: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email. Please try again later.")


# ===================================
# Terms & Conditions Endpoints
# ===================================

CURRENT_TERMS_VERSION = "1.0"


class TermsStatusResponse(BaseModel):
    accepted: bool
    accepted_at: Optional[str] = None
    version: Optional[str] = None


@app.get("/user/terms-status", response_model=TermsStatusResponse)
def get_terms_status(current_user: dict = Depends(get_current_user)):
    """Check if the user has accepted the current terms of service."""
    user_id = current_user.get("sub")

    try:
        metadata = auth0_management.get_user_metadata(user_id)
        terms_accepted = metadata.get("terms_accepted", False)
        terms_version = metadata.get("terms_version")

        # If terms version has changed, user needs to re-accept
        if terms_accepted and terms_version != CURRENT_TERMS_VERSION:
            terms_accepted = False

        return TermsStatusResponse(
            accepted=terms_accepted,
            accepted_at=metadata.get("terms_accepted_at"),
            version=terms_version
        )
    except Exception as e:
        logger.error(f"Error getting terms status for user {user_id}: {e}")
        return TermsStatusResponse(accepted=False)


@app.post("/user/accept-terms")
def accept_terms(current_user: dict = Depends(get_current_user)):
    """Accept the current terms of service."""
    from datetime import datetime, timezone

    user_id = current_user.get("sub")

    try:
        now = datetime.now(timezone.utc)
        metadata = {
            "terms_accepted": True,
            "terms_accepted_at": now.isoformat(),
            "terms_version": CURRENT_TERMS_VERSION
        }

        success = auth0_management.update_user_metadata(user_id, metadata)

        if success:
            logger.info(f"User {user_id} accepted terms version {CURRENT_TERMS_VERSION}")
            return {"success": True, "version": CURRENT_TERMS_VERSION}
        else:
            raise HTTPException(status_code=500, detail="Failed to save terms acceptance")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting terms for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to accept terms")


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
            if e.status == 400:
                # 400 typically means container isn't ready yet
                error_msg = "Server is still starting up. Logs will be available shortly."
                logger.info(f"Log stream not ready yet for {pod_name}: {e.status} - {e.reason}")
            else:
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
