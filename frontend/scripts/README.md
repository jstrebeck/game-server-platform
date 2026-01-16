# Frontend Docker Scripts

Scripts for building and running the Watch2Play frontend in Docker.

## Prerequisites

- Docker installed
- Backend API running (by default at `http://localhost:8000`)

## Building

```bash
cd frontend/scripts
./build.sh
```

This builds the Docker image as `watch2play-frontend:latest`.

## Running

```bash
cd frontend/scripts
./start.sh
```

The frontend will be available at `http://localhost:3000`.

### Environment Variables

You can customize the behavior with environment variables:

- `API_URL`: Backend API URL (default: `http://localhost:8000`)
- `PORT`: Host port to expose (default: `3000`)
- `CONTAINER_NAME`: Docker container name (default: `watch2play-frontend`)

### Examples

```bash
# Use custom API URL
API_URL=http://192.168.1.100:8000 ./start.sh

# Run on different port
PORT=8080 ./start.sh

# Use custom container name
CONTAINER_NAME=my-frontend ./start.sh

# Combine multiple options
API_URL=http://api.example.com PORT=8080 ./start.sh
```

## Viewing Logs

```bash
docker logs -f watch2play-frontend
```

## Stopping

```bash
docker stop watch2play-frontend
```

## Notes

- The `API_URL` is passed as `NEXT_PUBLIC_API_URL` to the Next.js application
- The container runs in detached mode (`-d` flag)
- Previous containers with the same name are automatically stopped and removed
- For WebSocket connections to work, ensure the API_URL is accessible from your browser
