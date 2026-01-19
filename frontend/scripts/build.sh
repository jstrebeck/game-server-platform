#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"

# Default values (can be overridden via environment)
API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8000}"

# Build the frontend Docker image
echo "Building Watch2Play frontend Docker image..."
echo "API URL (baked at build time): $API_URL"

docker build \
    --build-arg NEXT_PUBLIC_API_URL="$API_URL" \
    -t watch2play-frontend:latest \
    "$FRONTEND_DIR"

echo "Build complete! Image: watch2play-frontend:latest"
