# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Watch2Play is a game server hosting platform that allows users to provision on-demand Minecraft servers. The system consists of:

- **Frontend**: Next.js 16 (React 19, TypeScript, Tailwind CSS) web interface
- **Backend**: FastAPI Python service that orchestrates Kubernetes resources
- **Infrastructure**: Kubernetes-based deployment with per-user namespaces

## Architecture

### Backend (FastAPI + Kubernetes)

The backend (`backend/`) is a FastAPI application that manages Kubernetes resources to provision game servers:

- **main.py**: Core API endpoints and WebSocket server for log streaming
  - `POST /gameserver`: Creates a new game server (namespace, deployment, service)
  - `GET /gameserver/{user_id}/pods`: Lists pods in the user's namespace
  - `POST /gameserver/{user_id}/start`: Scales deployment to 1 replica
  - `POST /gameserver/{user_id}/stop`: Scales deployment to 0 replicas
  - `DELETE /gameserver/{user_id}`: Deletes the entire namespace
  - `WS /ws/logs/{namespace}/{pod_name}`: WebSocket endpoint for streaming pod logs

- **k8s/k8s_manager.py**: Kubernetes API wrapper class
  - Manages namespace, deployment, and service creation
  - Handles scaling and deletion operations
  - Auto-detects in-cluster vs local kubeconfig

- **k8s/game_templates.py**: Kubernetes resource templates
  - `minecraft_deployment()`: Returns V1Deployment for Minecraft server (itzg/minecraft-server image)
  - `minecraft_service()`: Returns LoadBalancer Service on port 25565

- **models/game_models.py**: Pydantic models for API request/response validation

**Namespace convention**: Each user gets a dedicated namespace `server-{user_id}` containing their deployment and service.

### Frontend (Next.js)

The frontend (`frontend/`) is a Next.js application with:

- **app/page.tsx**: Main UI (client component)
  - Simple form to create game servers by user ID
  - Displays server IP, port, and status after provisioning
  - Real-time WebSocket log viewer with auto-scroll and connection status indicator
  - Automatically fetches pod names and connects to log streams
  - Calls backend API at `NEXT_PUBLIC_API_URL` (defaults to http://localhost:8000)

- **app/layout.tsx**: Root layout with Geist fonts and metadata

## Development Commands

### Backend

```bash
# Install dependencies
cd backend
pip install -r requirements.txt

# Run development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Docker Scripts** (recommended for local development):

```bash
# Build Docker image
cd backend/scripts
./build.sh

# Start container (mounts kubeconfig automatically)
./start.sh

# With custom kubeconfig path
KUBECONFIG_PATH=/path/to/config ./start.sh

# With custom port
PORT=9000 ./start.sh
```

**Note**: The backend requires valid Kubernetes credentials. It will attempt to load in-cluster config first, then fall back to local kubeconfig (`~/.kube/config`). The Docker start script automatically mounts your kubeconfig into the container.

### Frontend

```bash
# Install dependencies
cd frontend
npm install

# Run development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

**Docker Scripts** (recommended for local development):

```bash
# Build Docker image
cd frontend/scripts
./build.sh

# Start container
./start.sh

# With custom API URL
API_URL=http://192.168.1.100:8000 ./start.sh

# With custom port
PORT=8080 ./start.sh
```

**Environment variable**: Set `NEXT_PUBLIC_API_URL` to point to the backend API (e.g., `http://localhost:8000`).

## Key Implementation Details

### Kubernetes Resource Management

- Each game server gets its own namespace for isolation
- Deployments use the `itzg/minecraft-server` Docker image
- Services are type LoadBalancer to expose servers externally
- The API waits up to 60 seconds for LoadBalancer IP assignment

### WebSocket Log Streaming

The backend uses a ThreadPoolExecutor to run blocking Kubernetes watch operations in separate threads while maintaining async WebSocket connections. This allows real-time pod log streaming to the frontend.

### CORS Configuration

The backend allows all origins in development mode (`allow_origins=["*"]`). This should be restricted in production.

## Deployment

Both services include multi-stage Dockerfiles optimized for production:

- **Backend**: Python 3.12 Alpine with build/runtime separation
- **Frontend**: Node 20 Alpine with deps/builder/runner stages

The frontend expects the backend API URL via `NEXT_PUBLIC_API_URL` environment variable.
