# Backend Docker Scripts

Scripts for building and running the Watch2Play backend in Docker.

## Prerequisites

- Docker installed
- Valid Kubernetes configuration at `~/.kube/config` (or custom path)
- Access to a Kubernetes cluster

## Building

```bash
cd backend/scripts
./build.sh
```

This builds the Docker image as `watch2play-backend:latest`.

## Running

```bash
cd backend/scripts
./start.sh
```

The backend will be available at `http://localhost:8000`.

### Environment Variables

You can customize the behavior with environment variables:

- `KUBECONFIG_PATH`: Path to your kubeconfig file (default: `~/.kube/config`)
- `PORT`: Host port to expose (default: `8000`)
- `CONTAINER_NAME`: Docker container name (default: `watch2play-backend`)

### Examples

```bash
# Use custom kubeconfig location
KUBECONFIG_PATH=/path/to/kubeconfig ./start.sh

# Run on different port
PORT=9000 ./start.sh

# Use custom container name
CONTAINER_NAME=my-backend ./start.sh

# Combine multiple options
KUBECONFIG_PATH=/custom/config PORT=9000 ./start.sh
```

## Viewing Logs

```bash
docker logs -f watch2play-backend
```

## Stopping

```bash
docker stop watch2play-backend
```

## Notes

- The kubeconfig is mounted as read-only into the container
- The container runs in detached mode (`-d` flag)
- Previous containers with the same name are automatically stopped and removed
