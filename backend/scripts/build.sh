#!/bin/bash

# Build the backend Docker image
echo "Building Watch2Play backend Docker image..."

docker build -t watch2play-backend:latest .

echo "Build complete! Image: watch2play-backend:latest"
