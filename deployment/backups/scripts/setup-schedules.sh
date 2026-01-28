#!/bin/bash
#
# Setup Velero Backup Schedules for Minecraft Servers
#

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

# Check if schedules already exist
if velero schedule get minecraft-daily &> /dev/null; then
    log_info "Schedule 'minecraft-daily' already exists. Deleting..."
    velero schedule delete minecraft-daily --confirm
fi

if velero schedule get minecraft-weekly &> /dev/null; then
    log_info "Schedule 'minecraft-weekly' already exists. Deleting..."
    velero schedule delete minecraft-weekly --confirm
fi

# Get all current server namespaces and label them
log_info "Labeling server namespaces..."
for ns in $(kubectl get namespaces -o name | grep "^namespace/server-" | sed 's|namespace/||'); do
    kubectl label namespace "$ns" backup=minecraft --overwrite
    log_info "  Labeled: $ns"
done

# Create daily backup schedule (3 AM UTC, 7 day retention)
log_info "Creating daily backup schedule..."
velero schedule create minecraft-daily \
    --schedule="0 3 * * *" \
    --selector backup=minecraft \
    --include-resources persistentvolumeclaims,persistentvolumes \
    --default-volumes-to-fs-backup \
    --ttl 168h

# Create weekly backup schedule (4 AM UTC on Sundays, 30 day retention)
log_info "Creating weekly backup schedule..."
velero schedule create minecraft-weekly \
    --schedule="0 4 * * 0" \
    --selector backup=minecraft \
    --include-resources persistentvolumeclaims,persistentvolumes \
    --default-volumes-to-fs-backup \
    --ttl 720h

log_success "Backup schedules created!"
echo ""
velero schedule get
