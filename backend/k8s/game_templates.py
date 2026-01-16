from kubernetes import client


def minecraft_pvc(game: str, storage: str = "10Gi"):
    """Create a PersistentVolumeClaim for Minecraft server data"""
    return client.V1PersistentVolumeClaim(
        metadata=client.V1ObjectMeta(name=f"{game}-data"),
        spec=client.V1PersistentVolumeClaimSpec(
            access_modes=["ReadWriteOnce"],
            resources=client.V1VolumeResourceRequirements(
                requests={"storage": storage}
            ),
        ),
    )


def minecraft_deployment(game: str, memory: str, pvc_name: str = None):
    """Create a Minecraft server deployment with optional persistent storage"""
    pvc_name = pvc_name or f"{game}-data"

    container = client.V1Container(
        name=game,
        image="itzg/minecraft-server",
        ports=[client.V1ContainerPort(container_port=25565)],
        env=[
            client.V1EnvVar(name="EULA", value="TRUE"),
            client.V1EnvVar(name="MEMORY", value=memory)
        ],
        volume_mounts=[
            client.V1VolumeMount(
                name="game-data",
                mount_path="/data",
            )
        ],
    )

    return client.V1Deployment(
        metadata=client.V1ObjectMeta(name=game),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(match_labels={"app": game}),
            template=client.V1PodTemplateSpec(
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
                )
            )
        )
    )

def minecraft_service(game):
    return client.V1Service(
        metadata=client.V1ObjectMeta(name=f"{game}-service"),
        spec=client.V1ServiceSpec(
            type="LoadBalancer",
            selector={"app": game},
            ports=[
                client.V1ServicePort(
                    port=25565,
                    target_port=25565
                )
            ]
        )
    )

