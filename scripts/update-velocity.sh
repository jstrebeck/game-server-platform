#!/bin/bash
# Script to update Velocity config while preserving dynamically registered servers

set -e

NAMESPACE="watch2play"
CONFIGMAP="velocity-config"
DEPLOYMENT="velocity"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VELOCITY_YAML="$SCRIPT_DIR/../deployment/velocity.yaml"

echo "=== Velocity Config Update Script ==="

# Step 1: Extract current server registrations from the configmap
echo "[1/5] Extracting current server registrations..."

CURRENT_CONFIG=$(kubectl get configmap $CONFIGMAP -n $NAMESPACE -o jsonpath='{.data.velocity\.toml}')

# Extract server entries (lines like: user-xxx = "address")
SERVERS=$(echo "$CURRENT_CONFIG" | grep -E '^user-[^ ]+ = "' || true)

# Extract forced-hosts entries (lines like: "hostname" = ["server"])
FORCED_HOSTS=$(echo "$CURRENT_CONFIG" | grep -E '^"[^"]+" = \["user-' || true)

echo "Found servers:"
echo "$SERVERS"
echo ""
echo "Found forced-hosts:"
echo "$FORCED_HOSTS"
echo ""

# Step 2: Apply the velocity.yaml to update base config
echo "[2/5] Applying velocity.yaml..."
kubectl apply -f "$VELOCITY_YAML"

# Step 3: Get the new base config
echo "[3/5] Reading new base config..."
NEW_CONFIG=$(kubectl get configmap $CONFIGMAP -n $NAMESPACE -o jsonpath='{.data.velocity\.toml}')

# Step 4: Inject the preserved servers and forced-hosts back into the config
echo "[4/5] Re-adding server registrations..."

# Add servers before the "try = " line
if [ -n "$SERVERS" ]; then
    while IFS= read -r server_line; do
        if [ -n "$server_line" ]; then
            # Insert server line before "try = "
            NEW_CONFIG=$(echo "$NEW_CONFIG" | sed "/^try = /i\\
$server_line")
        fi
    done <<< "$SERVERS"
fi

# Add forced-hosts after the "[forced-hosts]" line
if [ -n "$FORCED_HOSTS" ]; then
    while IFS= read -r host_line; do
        if [ -n "$host_line" ]; then
            # Insert host line after "[forced-hosts]"
            NEW_CONFIG=$(echo "$NEW_CONFIG" | sed "/^\[forced-hosts\]/a\\
$host_line")
        fi
    done <<< "$FORCED_HOSTS"
fi

# Update the configmap with the merged config
kubectl create configmap $CONFIGMAP \
    --from-literal="velocity.toml=$NEW_CONFIG" \
    -n $NAMESPACE \
    --dry-run=client -o yaml | kubectl apply -f -

# Step 5: Hot reload Velocity via RCON (or restart if RCON fails)
echo "[5/5] Reloading Velocity configuration..."

# Get the pod name
POD_NAME=$(kubectl get pods -n $NAMESPACE -l app=$DEPLOYMENT -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -n "$POD_NAME" ]; then
    # Write the updated config to the pod
    echo "$NEW_CONFIG" | kubectl exec -n $NAMESPACE $POD_NAME -c velocity -- sh -c 'cat > /server/velocity.toml'

    # Try to reload via RCON
    if kubectl exec -n $NAMESPACE $POD_NAME -c velocity -- rcon-cli "velocity reload" 2>/dev/null; then
        echo "Configuration reloaded via RCON"
    else
        echo "RCON reload failed, restarting deployment..."
        kubectl rollout restart deployment/$DEPLOYMENT -n $NAMESPACE
        kubectl rollout status deployment/$DEPLOYMENT -n $NAMESPACE --timeout=60s
    fi
else
    echo "No Velocity pod found, restarting deployment..."
    kubectl rollout restart deployment/$DEPLOYMENT -n $NAMESPACE
    kubectl rollout status deployment/$DEPLOYMENT -n $NAMESPACE --timeout=60s
fi

echo ""
echo "=== Velocity updated successfully ==="

# Verify the config
echo ""
echo "Current server registrations:"
kubectl get configmap $CONFIGMAP -n $NAMESPACE -o jsonpath='{.data.velocity\.toml}' | grep -E '(^user-|^\[forced-hosts\]|^"[^"]+" = \["user-)'
