#!/bin/bash
#
# Backup All Minecraft Server PVCs
# This script creates backups for all server-* namespaces
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_PREFIX="minecraft-all"
TTL="${1:-168h}"  # Default 7 days retention

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Get all server namespaces
NAMESPACES=$(kubectl get namespaces -o name | grep "^namespace/server-" | sed 's|namespace/||')

if [ -z "$NAMESPACES" ]; then
    log_warn "No server namespaces found."
    exit 0
fi

log_info "Found server namespaces:"
echo "$NAMESPACES" | while read ns; do echo "  - $ns"; done
echo ""

# Label all namespaces for backup
log_info "Labeling namespaces..."
echo "$NAMESPACES" | while read ns; do
    kubectl label namespace "$ns" backup=minecraft --overwrite 2>/dev/null || true
done

# Create combined backup
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="${BACKUP_PREFIX}-${TIMESTAMP}"

# Build namespace list
NS_LIST=$(echo "$NAMESPACES" | tr '\n' ',' | sed 's/,$//')

log_info "Creating backup: $BACKUP_NAME"
log_info "Namespaces: $NS_LIST"
log_info "TTL: $TTL"

velero backup create "$BACKUP_NAME" \
    --include-namespaces "$NS_LIST" \
    --include-resources persistentvolumeclaims,persistentvolumes \
    --default-volumes-to-fs-backup \
    --ttl "$TTL"

log_info "Backup initiated: $BACKUP_NAME"
log_info "Check status: velero backup describe $BACKUP_NAME"

# Optionally wait for completion
if [ "${2:-}" = "--wait" ]; then
    log_info "Waiting for backup to complete..."
    velero backup wait "$BACKUP_NAME"

    STATUS=$(velero backup get "$BACKUP_NAME" -o json | jq -r '.status.phase')
    if [ "$STATUS" = "Completed" ]; then
        log_success "All backups completed successfully"
    else
        log_error "Backup finished with status: $STATUS"
    fi
fi
