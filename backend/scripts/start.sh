#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

# Default values
KUBECONFIG_PATH="${KUBECONFIG_PATH:-$HOME/.kube/config}"
PORT="${PORT:-8000}"
CONTAINER_NAME="${CONTAINER_NAME:-watch2play-backend}"
ENV_FILE="${ENV_FILE:-$BACKEND_DIR/.env}"

echo "Starting Watch2Play backend..."
echo "Kubeconfig: $KUBECONFIG_PATH"
echo "Port: $PORT"
echo "Env file: $ENV_FILE"

# Check if kubeconfig exists
if [ ! -f "$KUBECONFIG_PATH" ]; then
    echo "ERROR: Kubeconfig not found at $KUBECONFIG_PATH"
    echo "Please set KUBECONFIG_PATH environment variable or ensure ~/.kube/config exists"
    exit 1
fi

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "WARNING: .env file not found at $ENV_FILE"
    echo "Auth0 authentication will not work without proper configuration."
    echo "Copy .env.example to .env and fill in your Auth0 credentials."
fi

# Stop and remove existing container if it exists
docker stop $CONTAINER_NAME 2>/dev/null
docker rm $CONTAINER_NAME 2>/dev/null

# Build docker run command
DOCKER_CMD="docker run -d \
    --name $CONTAINER_NAME \
    -p $PORT:8000 \
    -v $KUBECONFIG_PATH:/root/.kube/config:ro \
    -e KUBECONFIG=/root/.kube/config"

# Add env file if it exists
if [ -f "$ENV_FILE" ]; then
    DOCKER_CMD="$DOCKER_CMD --env-file $ENV_FILE"
fi

DOCKER_CMD="$DOCKER_CMD watch2play-backend:latest"

# Run the container
eval $DOCKER_CMD

echo "Backend started successfully!"
echo "API available at: http://localhost:$PORT"
echo ""
echo "View logs with: docker logs -f $CONTAINER_NAME"
echo "Stop with: docker stop $CONTAINER_NAME"
