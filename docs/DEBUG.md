# Debugging WebSocket Log Streaming

## The Problem

WebSocket connects but immediately closes with no data displayed.

## Updated Fix

The backend has been updated with comprehensive error handling and logging. Now:
- All errors are sent to the WebSocket client
- Detailed logs are written to backend console
- Connection lifecycle is fully logged

## How to Test

### Step 1: Restart the Backend

If running with Docker:
```bash
cd backend/scripts
docker stop watch2play-backend
./start.sh
```

If running directly:
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Step 2: Watch Backend Logs

In a separate terminal, watch the backend logs:
```bash
# If using Docker
docker logs -f watch2play-backend

# If running directly, logs appear in the terminal where uvicorn is running
```

### Step 3: Test WebSocket Connection

```bash
# First, get your pod name
curl http://localhost:8000/gameserver/YOUR_USER_ID/pods

# Then test WebSocket with the pod name from above
websocat ws://localhost:8000/ws/logs/server-YOUR_USER_ID/POD_NAME
```

## What to Look For

### In Backend Logs:

You should see messages like:
```
INFO: WebSocket connection request for server-testuser/minecraft-xxxxx-xxxxx
INFO: WebSocket connection accepted for server-testuser/minecraft-xxxxx-xxxxx
INFO: Starting log stream for pod minecraft-xxxxx-xxxxx in namespace server-testuser
INFO: Using local kubeconfig
INFO: Found pod minecraft-xxxxx-xxxxx, status: Running
INFO: Starting log watch for minecraft-xxxxx-xxxxx
```

### In WebSocket Client (websocat):

**If successful**, you'll see Minecraft server logs:
```
[Server thread/INFO]: Starting minecraft server version 1.20.1
[Server thread/INFO]: Loading properties
[Server thread/INFO]: Default game type: SURVIVAL
...
```

**If there's an error**, you'll see:
```
ERROR: Pod not found: minecraft-xxxxx-xxxxx in namespace server-testuser
```
or
```
ERROR: Kubernetes API error: 404 - Not Found
```

## Common Issues and Solutions

### Issue 1: "Pod not found" error

**Cause**: The pod name or namespace is incorrect.

**Solutions**:
1. List all pods in the namespace:
   ```bash
   kubectl get pods -n server-YOUR_USER_ID
   ```

2. Verify the pod name exactly matches (case-sensitive)

3. Use the `/gameserver/{user_id}/pods` endpoint to get the correct name:
   ```bash
   curl http://localhost:8000/gameserver/YOUR_USER_ID/pods
   ```

### Issue 2: "Kubernetes API error: Unauthorized"

**Cause**: Backend can't access Kubernetes.

**Solutions**:
1. Verify kubeconfig is mounted:
   ```bash
   docker inspect watch2play-backend | grep -A 5 Mounts
   ```

2. Test kubectl access:
   ```bash
   kubectl get pods --all-namespaces
   ```

3. Check kubeconfig path:
   ```bash
   echo $KUBECONFIG_PATH
   ls -la ~/.kube/config
   ```

### Issue 3: No logs but pod exists

**Cause**: Pod has no logs yet or hasn't started containers.

**Solutions**:
1. Check pod status:
   ```bash
   kubectl get pod POD_NAME -n NAMESPACE -o yaml
   ```

2. Wait for pod to be Running:
   ```bash
   kubectl wait --for=condition=Ready pod/POD_NAME -n NAMESPACE --timeout=60s
   ```

3. Check if containers are running:
   ```bash
   kubectl describe pod POD_NAME -n NAMESPACE
   ```

### Issue 4: Connection closes immediately with no error

**Cause**: The streaming thread is crashing silently.

**Solutions**:
1. Check backend logs for Python exceptions
2. Verify the pod has at least one container
3. Try streaming logs directly with kubectl:
   ```bash
   kubectl logs -f POD_NAME -n NAMESPACE
   ```

## Testing the Full Flow

Run this command to test everything:
```bash
./test_flow.sh YOUR_USER_ID
```

Then use the WebSocket command it provides at the end.

## Checking Frontend Logs

Open browser DevTools (F12):
1. **Console tab**: Look for WebSocket errors
2. **Network tab**: Filter by "WS" to see WebSocket connections
   - Click on the connection
   - Check "Messages" tab to see data flow
   - Check "Frames" tab to see actual data transmitted

## Direct Kubernetes Comparison

To verify the issue is with WebSocket and not Kubernetes:
```bash
# This should work if Kubernetes access is configured
kubectl logs -f POD_NAME -n NAMESPACE
```

If kubectl logs work but WebSocket doesn't, check:
- Is the backend running with the correct kubeconfig?
- Are there permission differences between your user and the backend?
- Check backend logs for specific errors
