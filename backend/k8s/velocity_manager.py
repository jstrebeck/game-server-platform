"""
Velocity Proxy Configuration Manager

Manages the Velocity proxy ConfigMap to dynamically add/remove Minecraft servers.
"""
import hashlib
import logging
import re
from kubernetes import client, config

logger = logging.getLogger(__name__)

VELOCITY_NAMESPACE = "watch2play"
VELOCITY_CONFIGMAP = "velocity-config"
VELOCITY_DEPLOYMENT = "velocity"


class VelocityManager:
    def __init__(self):
        self._load_config()

    def _load_config(self):
        """Load Kubernetes configuration"""
        try:
            config.load_incluster_config()
        except:
            config.load_kube_config()

    def _get_configmap(self) -> client.V1ConfigMap:
        """Get the Velocity ConfigMap"""
        v1 = client.CoreV1Api()
        return v1.read_namespaced_config_map(
            name=VELOCITY_CONFIGMAP,
            namespace=VELOCITY_NAMESPACE
        )

    def _update_configmap(self, cm: client.V1ConfigMap):
        """Update the Velocity ConfigMap"""
        v1 = client.CoreV1Api()
        v1.replace_namespaced_config_map(
            name=VELOCITY_CONFIGMAP,
            namespace=VELOCITY_NAMESPACE,
            body=cm
        )

    def _reload_velocity(self):
        """Reload Velocity config by copying updated config and sending reload command"""
        v1 = client.CoreV1Api()

        # Find the Velocity pod
        pods = v1.list_namespaced_pod(
            namespace=VELOCITY_NAMESPACE,
            label_selector="app=velocity"
        )

        if not pods.items:
            logger.error("No Velocity pod found")
            return

        pod_name = pods.items[0].metadata.name

        # Copy updated config from ConfigMap to /server (since we use emptyDir)
        # First, read the current ConfigMap
        cm = self._get_configmap()
        velocity_toml = cm.data.get("velocity.toml", "")

        # Write the config to the pod using exec
        from kubernetes.stream import stream

        # Write velocity.toml
        exec_command = ['sh', '-c', f'cat > /server/velocity.toml << \'EOFCONFIG\'\n{velocity_toml}\nEOFCONFIG']
        try:
            stream(
                v1.connect_get_namespaced_pod_exec,
                pod_name,
                VELOCITY_NAMESPACE,
                command=exec_command,
                container='velocity',
                stderr=True,
                stdin=False,
                stdout=True,
                tty=False
            )
            logger.info(f"Updated velocity.toml in pod {pod_name}")
        except Exception as e:
            logger.error(f"Failed to update config in pod: {e}")
            return

        # Send reload command to Velocity console
        # Velocity uses 'velocity reload' command
        exec_command = ['sh', '-c', 'echo "velocity reload" > /proc/1/fd/0']
        try:
            stream(
                v1.connect_get_namespaced_pod_exec,
                pod_name,
                VELOCITY_NAMESPACE,
                command=exec_command,
                container='velocity',
                stderr=True,
                stdin=False,
                stdout=True,
                tty=False
            )
            logger.info(f"Sent reload command to Velocity")
        except Exception as e:
            logger.warning(f"Could not send reload command: {e}")

        logger.info(f"Reloaded Velocity config without restart")

    def register_server(self, user_id: str, namespace: str, hostname: str):
        """
        Register a Minecraft server with Velocity.

        Args:
            user_id: The user ID (used as server name)
            namespace: The Kubernetes namespace where the server runs
            hostname: The hostname players will use to connect (e.g., alice.mc.watch2play.local)
        """
        server_name = f"user-{user_id}"
        # Service DNS name within the cluster
        server_address = f"minecraft-service.{namespace}.svc.cluster.local:25565"

        cm = self._get_configmap()
        velocity_toml = cm.data.get("velocity.toml", "")

        # Add server to [servers] section
        if f'{server_name} = ' not in velocity_toml:
            # Find the line with "try = " and insert before it
            lines = velocity_toml.split('\n')
            new_lines = []
            for line in lines:
                if line.strip().startswith('try = '):
                    new_lines.append(f'{server_name} = "{server_address}"')
                new_lines.append(line)
            velocity_toml = '\n'.join(new_lines)

        # Add to try list
        try_pattern = r'try = \[(.*?)\]'
        try_match = re.search(try_pattern, velocity_toml)
        if try_match:
            current_try = try_match.group(1).strip()
            if f'"{server_name}"' not in current_try:
                if current_try:
                    new_try = f'[{current_try}, "{server_name}"]'
                else:
                    new_try = f'["{server_name}"]'
                velocity_toml = re.sub(try_pattern, f'try = {new_try}', velocity_toml)

        # Add forced host mapping
        if f'"{hostname}"' not in velocity_toml:
            # Find [forced-hosts] section and add after it
            lines = velocity_toml.split('\n')
            new_lines = []
            for i, line in enumerate(lines):
                new_lines.append(line)
                if line.strip() == '[forced-hosts]':
                    new_lines.append(f'"{hostname}" = ["{server_name}"]')
            velocity_toml = '\n'.join(new_lines)

        cm.data["velocity.toml"] = velocity_toml
        self._update_configmap(cm)
        self._reload_velocity()

        logger.info(f"Registered server {server_name} with hostname {hostname}")

    def unregister_server(self, user_id: str, hostname: str):
        """
        Unregister a Minecraft server from Velocity.

        Args:
            user_id: The user ID
            hostname: The hostname to remove
        """
        server_name = f"user-{user_id}"

        cm = self._get_configmap()
        velocity_toml = cm.data.get("velocity.toml", "")

        # Remove server from [servers] section
        server_line_pattern = rf'\n{re.escape(server_name)} = "[^"]*"'
        velocity_toml = re.sub(server_line_pattern, '', velocity_toml)

        # Remove from try list
        try_pattern = r'try = \[(.*?)\]'
        try_match = re.search(try_pattern, velocity_toml)
        if try_match:
            current_try = try_match.group(1).strip()
            # Remove this server from the try list
            servers_in_try = [s.strip() for s in current_try.split(',') if s.strip()]
            servers_in_try = [s for s in servers_in_try if s != f'"{server_name}"']
            new_try = ', '.join(servers_in_try)
            velocity_toml = re.sub(try_pattern, f'try = [{new_try}]', velocity_toml)

        # Remove forced host mapping
        host_line_pattern = rf'\n"{re.escape(hostname)}" = \["{re.escape(server_name)}"\]'
        velocity_toml = re.sub(host_line_pattern, '', velocity_toml)

        cm.data["velocity.toml"] = velocity_toml
        self._update_configmap(cm)
        self._reload_velocity()

        logger.info(f"Unregistered server {server_name} with hostname {hostname}")

    def list_servers(self) -> dict:
        """
        List all registered servers.

        Returns:
            Dict mapping server names to their addresses
        """
        cm = self._get_configmap()
        velocity_toml = cm.data.get("velocity.toml", "")

        servers = {}
        servers_pattern = r'\[servers\](.*?)(?=\n\[|\Z)'
        servers_match = re.search(servers_pattern, velocity_toml, re.DOTALL)

        if servers_match:
            servers_section = servers_match.group(1)
            server_pattern = r'^(\S+)\s*=\s*"([^"]+)"'
            for line in servers_section.strip().split('\n'):
                match = re.match(server_pattern, line.strip())
                if match and not line.strip().startswith('#') and not line.strip().startswith('try'):
                    servers[match.group(1)] = match.group(2)

        return servers
