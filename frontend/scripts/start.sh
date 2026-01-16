#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"

# Default values
API_URL="${API_URL:-http://localhost:8000}"
PORT="${PORT:-3000}"
CONTAINER_NAME="${CONTAINER_NAME:-watch2play-frontend}"
ENV_FILE="${ENV_FILE:-$FRONTEND_DIR/.env.local}"

echo "Starting Watch2Play frontend..."
echo "API URL: $API_URL"
echo "Port: $PORT"
echo "Env file: $ENV_FILE"

# Check if .env.local file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "WARNING: .env.local file not found at $ENV_FILE"
    echo "Auth0 authentication will not work without proper configuration."
    echo "Copy .env.example to .env.local and fill in your Auth0 credentials."
fi

# Stop and remove existing container if it exists
docker stop $CONTAINER_NAME 2>/dev/null
docker rm $CONTAINER_NAME 2>/dev/null

# Build docker run command
DOCKER_CMD="docker run -d \
    --name $CONTAINER_NAME \
    -p $PORT:3000 \
    -e NEXT_PUBLIC_API_URL=$API_URL"

# Add env file if it exists
if [ -f "$ENV_FILE" ]; then
    DOCKER_CMD="$DOCKER_CMD --env-file $ENV_FILE"
fi

DOCKER_CMD="$DOCKER_CMD watch2play-frontend:latest"

# Run the container
eval $DOCKER_CMD

echo "Frontend started successfully!"
echo "Application available at: http://localhost:$PORT"
echo ""
echo "View logs with: docker logs -f $CONTAINER_NAME"
echo "Stop with: docker stop $CONTAINER_NAME"
