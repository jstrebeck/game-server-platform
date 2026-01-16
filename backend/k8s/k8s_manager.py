from kubernetes import client, config
import time

class K8sManager:
    def __init__(self):
        try:
            config.load_incluster_config()
            print("Loaded in-cluster config")
        except:
            config.load_kube_config()
            print("Loaded local kube config")

        self.core = client.CoreV1Api()
        self.apps = client.AppsV1Api()

    def create_namespace(self, namespace):
        body = client.V1Namespace(
            metadata=client.V1ObjectMeta(name=namespace)
        )

        try:
            self.core.create_namespace(body)
        except client.exceptions.ApiException as e:
            if e.status != 409:
                raise

    def create_deployment(self, namespace, deployment_body):
        return self.apps.create_namespaced_deployment(
            namespace=namespace,
            body=deployment_body
        )

    def create_service(self, namespace, service_body):
        return self.core.create_namespaced_service(
            namespace=namespace,
            body=service_body
        )

    def create_pvc(self, namespace, pvc_body):
        try:
            return self.core.create_namespaced_persistent_volume_claim(
                namespace=namespace,
                body=pvc_body
            )
        except client.exceptions.ApiException as e:
            if e.status != 409:  # Ignore if already exists
                raise

    def get_service_ip(self, namespace, name, timeout=60):
        for _ in range(timeout):
            svc = self.core.read_namespaced_service(name, namespace)
            if svc.status.load_balancer and svc.status.load_balancer.ingress:
                return svc.status.load_balancer.ingress[0].ip
            time.sleep(2)
        return None

    def scale_deployment(self, namespace, name, replicas):
        body = {'spec': {'replicas': replicas}}
        return self.apps.patch_namespaced_deployment_scale(
            name=name,
            namespace=namespace,
            body=body
        )

    def delete_namespace(self, namespace):
        return self.core.delete_namespace(namespace)
