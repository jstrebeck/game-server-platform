#!/bin/bash
#
# Minecraft Server PVC Backup/Restore Script
# Uses Velero to backup and restore individual user server data
#

set -e

SCRIPT_NAME=$(basename "$0")
BACKUP_PREFIX="minecraft-manual"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

usage() {
    cat << EOF
Usage: $SCRIPT_NAME <command> <user_id> [options]

Commands:
    backup      Create a backup of a user's Minecraft server PVC
    restore     Restore a user's Minecraft server from a backup
    list        List all backups for a user
    delete      Delete a specific backup

Examples:
    $SCRIPT_NAME backup alice
    $SCRIPT_NAME backup alice --wait
    $SCRIPT_NAME restore alice --backup minecraft-manual-alice-20240115-1430
    $SCRIPT_NAME list alice
    $SCRIPT_NAME delete alice --backup minecraft-manual-alice-20240115-1430

Options:
    --wait              Wait for backup/restore to complete
    --backup <name>     Specify backup name (required for restore/delete)
    --ttl <duration>    Backup retention time (default: 720h / 30 days)
    --help              Show this help message
EOF
    exit 1
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

check_velero() {
    if ! command -v velero &> /dev/null; then
        log_error "Velero CLI not found. Please install it first."
    fi

    # Check if velero is running in cluster
    if ! kubectl get deployment velero -n velero &> /dev/null; then
        log_error "Velero is not installed in the cluster. Run 'velero install' first."
    fi
}

check_namespace() {
    local user_id="$1"
    local namespace="server-${user_id}"

    if ! kubectl get namespace "$namespace" &> /dev/null; then
        log_error "Namespace '$namespace' does not exist. User may not have a server."
    fi
}

check_pvc() {
    local user_id="$1"
    local namespace="server-${user_id}"

    if ! kubectl get pvc minecraft-data -n "$namespace" &> /dev/null; then
        log_error "PVC 'minecraft-data' not found in namespace '$namespace'."
    fi
}

stop_server() {
    local user_id="$1"
    local namespace="server-${user_id}"

    log_info "Stopping Minecraft server in $namespace..."

    # Scale deployment to 0
    if kubectl get deployment minecraft -n "$namespace" &> /dev/null; then
        kubectl scale deployment minecraft -n "$namespace" --replicas=0

        # Wait for pod to terminate
        log_info "Waiting for server pod to terminate..."
        kubectl wait --for=delete pod -l app=minecraft -n "$namespace" --timeout=120s 2>/dev/null || true
    fi
}

start_server() {
    local user_id="$1"
    local namespace="server-${user_id}"

    log_info "Starting Minecraft server in $namespace..."

    if kubectl get deployment minecraft -n "$namespace" &> /dev/null; then
        kubectl scale deployment minecraft -n "$namespace" --replicas=1
    fi
}

do_backup() {
    local user_id="$1"
    local wait_flag="$2"
    local ttl="${3:-720h}"

    local namespace="server-${user_id}"
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_name="${BACKUP_PREFIX}-${user_id}-${timestamp}"

    check_namespace "$user_id"
    check_pvc "$user_id"

    # Label the namespace for backup selection
    kubectl label namespace "$namespace" backup=minecraft --overwrite

    # Stop the server before backup for data consistency
    stop_server "$user_id"

    log_info "Creating backup: $backup_name"
    log_info "Namespace: $namespace"
    log_info "TTL: $ttl"

    local velero_cmd="velero backup create $backup_name \
        --include-namespaces $namespace \
        --include-resources persistentvolumeclaims,persistentvolumes \
        --default-volumes-to-fs-backup \
        --ttl $ttl"

    if [ "$wait_flag" = "true" ]; then
        velero_cmd="$velero_cmd --wait"
    fi

    eval $velero_cmd

    if [ "$wait_flag" = "true" ]; then
        # Check backup status
        local status=$(velero backup get "$backup_name" -o json | jq -r '.status.phase')
        if [ "$status" = "Completed" ]; then
            log_success "Backup completed successfully: $backup_name"
        else
            log_error "Backup failed with status: $status"
        fi
    else
        log_info "Backup started. Check status with: velero backup describe $backup_name"
    fi

    # Restart the server
    start_server "$user_id"

    echo ""
    echo "Backup name: $backup_name"
}

do_restore() {
    local user_id="$1"
    local backup_name="$2"
    local wait_flag="$3"

    local namespace="server-${user_id}"

    if [ -z "$backup_name" ]; then
        log_error "Backup name is required. Use --backup <name>"
    fi

    # Verify backup exists
    if ! velero backup get "$backup_name" &> /dev/null; then
        log_error "Backup '$backup_name' not found."
    fi

    check_namespace "$user_id"

    # Stop the server before restore
    stop_server "$user_id"

    log_info "Restoring from backup: $backup_name"
    log_info "Target namespace: $namespace"

    # Delete existing PVC to allow restore
    log_warn "Deleting existing PVC minecraft-data in $namespace..."
    kubectl delete pvc minecraft-data -n "$namespace" --ignore-not-found

    local restore_name="restore-${user_id}-$(date +%Y%m%d-%H%M%S)"

    local velero_cmd="velero restore create $restore_name \
        --from-backup $backup_name \
        --include-namespaces $namespace"

    if [ "$wait_flag" = "true" ]; then
        velero_cmd="$velero_cmd --wait"
    fi

    eval $velero_cmd

    if [ "$wait_flag" = "true" ]; then
        local status=$(velero restore get "$restore_name" -o json | jq -r '.status.phase')
        if [ "$status" = "Completed" ]; then
            log_success "Restore completed successfully"
        else
            log_warn "Restore finished with status: $status"
            log_info "Check details: velero restore describe $restore_name"
        fi
    else
        log_info "Restore started. Check status with: velero restore describe $restore_name"
    fi

    # Restart the server
    start_server "$user_id"
}

do_list() {
    local user_id="$1"
    local namespace="server-${user_id}"

    log_info "Listing backups for user: $user_id (namespace: $namespace)"
    echo ""

    # List backups that include this namespace
    velero backup get -o json | jq -r --arg ns "$namespace" \
        '.items[] | select(.spec.includedNamespaces[]? == $ns) |
        "\(.metadata.name)\t\(.status.phase)\t\(.status.startTimestamp)\t\(.status.expiration)"' | \
        column -t -s $'\t' -N "NAME,STATUS,STARTED,EXPIRES"

    # Also show backups with matching prefix
    echo ""
    log_info "Backups with prefix '${BACKUP_PREFIX}-${user_id}':"
    velero backup get | grep "${BACKUP_PREFIX}-${user_id}" || echo "No matching backups found."
}

do_delete() {
    local user_id="$1"
    local backup_name="$2"

    if [ -z "$backup_name" ]; then
        log_error "Backup name is required. Use --backup <name>"
    fi

    # Verify backup exists
    if ! velero backup get "$backup_name" &> /dev/null; then
        log_error "Backup '$backup_name' not found."
    fi

    log_warn "This will permanently delete backup: $backup_name"
    read -p "Are you sure? (y/N): " confirm

    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        velero backup delete "$backup_name" --confirm
        log_success "Backup deleted: $backup_name"
    else
        log_info "Cancelled."
    fi
}

# Parse arguments
COMMAND=""
USER_ID=""
BACKUP_NAME=""
WAIT_FLAG="false"
TTL="720h"

while [[ $# -gt 0 ]]; do
    case $1 in
        backup|restore|list|delete)
            COMMAND="$1"
            shift
            ;;
        --wait)
            WAIT_FLAG="true"
            shift
            ;;
        --backup)
            BACKUP_NAME="$2"
            shift 2
            ;;
        --ttl)
            TTL="$2"
            shift 2
            ;;
        --help|-h)
            usage
            ;;
        -*)
            log_error "Unknown option: $1"
            ;;
        *)
            if [ -z "$USER_ID" ]; then
                USER_ID="$1"
            fi
            shift
            ;;
    esac
done

# Validate inputs
if [ -z "$COMMAND" ]; then
    log_error "Command is required. Use: backup, restore, list, or delete"
fi

if [ -z "$USER_ID" ]; then
    log_error "User ID is required."
fi

# Check velero is available
check_velero

# Execute command
case $COMMAND in
    backup)
        do_backup "$USER_ID" "$WAIT_FLAG" "$TTL"
        ;;
    restore)
        do_restore "$USER_ID" "$BACKUP_NAME" "$WAIT_FLAG"
        ;;
    list)
        do_list "$USER_ID"
        ;;
    delete)
        do_delete "$USER_ID" "$BACKUP_NAME"
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        ;;
esac
