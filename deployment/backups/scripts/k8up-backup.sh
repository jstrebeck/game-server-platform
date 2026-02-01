#!/bin/bash
# K8up Manual Backup/Restore Script
# Usage:
#   ./k8up-backup.sh backup <user_id>
#   ./k8up-backup.sh restore <user_id> <snapshot_id>
#   ./k8up-backup.sh list <user_id>

set -e

ACTION=$1
USER_ID=$2
SNAPSHOT_ID=$3

# Configuration - UPDATE THESE
B2_BUCKET="${K8UP_B2_BUCKET:-minecrafthosting}"
B2_ENDPOINT="${K8UP_B2_ENDPOINT:-s3.us-west-004.backblazeb2.com}"

usage() {
  echo "K8up Backup/Restore Script"
  echo ""
  echo "Usage:"
  echo "  $0 backup <user_id>              - Create immediate backup"
  echo "  $0 restore <user_id> <snapshot>  - Restore from snapshot"
  echo "  $0 list <user_id>                - List available snapshots"
  echo "  $0 status <user_id>              - Check backup status"
  echo ""
  echo "Environment variables:"
  echo "  K8UP_B2_BUCKET   - Backblaze bucket (default: minecrafthosting)"
  echo "  K8UP_B2_ENDPOINT - Backblaze endpoint (default: s3.us-west-004.backblazeb2.com)"
  echo ""
  echo "Examples:"
  echo "  $0 backup alice"
  echo "  $0 list alice"
  echo "  $0 restore alice abc123def"
  exit 1
}

check_namespace() {
  local ns=$1
  if ! kubectl get namespace "$ns" &>/dev/null; then
    echo "Error: Namespace $ns does not exist"
    exit 1
  fi
}

check_secrets() {
  local ns=$1
  if ! kubectl get secret backblaze-credentials -n "$ns" &>/dev/null; then
    echo "Error: backblaze-credentials secret not found in $ns"
    echo "Run: ./k8up-setup-namespace.sh $USER_ID"
    exit 1
  fi
}

do_backup() {
  local namespace="server-${USER_ID}"
  check_namespace "$namespace"
  check_secrets "$namespace"

  local backup_name="manual-$(date +%Y%m%d-%H%M%S)"

  echo "Creating backup: $backup_name in $namespace"

  cat <<EOF | kubectl apply -f -
apiVersion: k8up.io/v1
kind: Backup
metadata:
  name: ${backup_name}
  namespace: ${namespace}
spec:
  podSecurityContext:
    runAsUser: 1000
    fsGroup: 1000
  failedJobsHistoryLimit: 2
  successfulJobsHistoryLimit: 2
  backend:
    repoPasswordSecretRef:
      name: restic-repo-password
      key: password
    s3:
      endpoint: https://${B2_ENDPOINT}
      bucket: ${B2_BUCKET}
      accessKeyIDSecretRef:
        name: backblaze-credentials
        key: username
      secretAccessKeySecretRef:
        name: backblaze-credentials
        key: password
EOF

  echo ""
  echo "Backup job created: $backup_name"
  echo ""
  echo "Monitor with:"
  echo "  kubectl get backups -n $namespace"
  echo "  kubectl logs -n $namespace -l k8up.io/type=backup -f"
}

do_list() {
  local namespace="server-${USER_ID}"
  check_namespace "$namespace"
  check_secrets "$namespace"

  local pod_name="restic-list-$(date +%s)"

  echo "Listing snapshots for $namespace..."

  # Create a pod to run restic snapshots directly
  cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ${pod_name}
  namespace: ${namespace}
spec:
  restartPolicy: Never
  securityContext:
    runAsNonRoot: true
    runAsUser: 65534
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: restic
    image: restic/restic:latest
    command: ["restic", "snapshots"]
    securityContext:
      allowPrivilegeEscalation: false
      capabilities:
        drop: ["ALL"]
    env:
    - name: AWS_ACCESS_KEY_ID
      valueFrom:
        secretKeyRef:
          name: backblaze-credentials
          key: username
    - name: AWS_SECRET_ACCESS_KEY
      valueFrom:
        secretKeyRef:
          name: backblaze-credentials
          key: password
    - name: RESTIC_PASSWORD
      valueFrom:
        secretKeyRef:
          name: restic-repo-password
          key: password
    - name: RESTIC_REPOSITORY
      value: "s3:https://${B2_ENDPOINT}/${B2_BUCKET}"
EOF

  echo "Waiting for snapshot list..."
  sleep 3

  # Wait for pod to complete
  if kubectl wait --for=condition=Ready pod/$pod_name -n "$namespace" --timeout=30s 2>/dev/null || \
     kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/$pod_name -n "$namespace" --timeout=60s 2>/dev/null; then
    sleep 2
  fi

  echo ""
  echo "Available snapshots:"
  kubectl logs -n "$namespace" $pod_name 2>/dev/null | grep -v "unable to open cache"

  # Cleanup
  kubectl delete pod $pod_name -n "$namespace" --ignore-not-found >/dev/null 2>&1 &
}

do_restore() {
  if [ -z "$SNAPSHOT_ID" ]; then
    echo "Error: Snapshot ID required for restore"
    echo "Usage: $0 restore <user_id> <snapshot_id>"
    echo ""
    echo "List snapshots with: $0 list $USER_ID"
    exit 1
  fi

  local namespace="server-${USER_ID}"
  check_namespace "$namespace"
  check_secrets "$namespace"

  echo "=== Restore Process for $namespace ==="
  echo ""
  echo "WARNING: This will stop the Minecraft server, DELETE existing data, and restore from backup."
  read -p "Continue? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi

  echo ""
  echo "Step 1: Scaling down Minecraft deployment..."
  kubectl scale deployment minecraft -n "$namespace" --replicas=0 2>/dev/null || \
    echo "Warning: Could not scale deployment (may not exist)"

  echo "Waiting for pod to terminate..."
  kubectl wait --for=delete pod -l app=minecraft -n "$namespace" --timeout=120s 2>/dev/null || true
  sleep 2

  local restore_pod="restore-$(date +%s)"

  echo ""
  echo "Step 2: Running restore from snapshot ${SNAPSHOT_ID}..."

  # Create a pod that mounts the PVC and runs restic restore directly
  cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ${restore_pod}
  namespace: ${namespace}
spec:
  restartPolicy: Never
  securityContext:
    runAsUser: 0
    fsGroup: 0
  containers:
  - name: restore
    image: restic/restic:latest
    command:
    - /bin/sh
    - -c
    - |
      echo "=== Starting Restore ==="
      echo "Clearing existing data..."
      rm -rf /restore/* /restore/.[!.]* /restore/..?* 2>/dev/null || true
      echo "Restoring snapshot ${SNAPSHOT_ID}..."
      # Ignore xattr errors (SELinux attributes can't be restored)
      restic restore ${SNAPSHOT_ID} --target /tmp/restore-staging --verbose || true
      echo ""
      # Verify restore worked
      if [ ! -d "/tmp/restore-staging/data/minecraft-data" ]; then
        echo "ERROR: Restore failed - no data found"
        exit 1
      fi
      echo "Staging directory contents:"
      ls -la /tmp/restore-staging/data/minecraft-data/ | head -20
      echo ""
      echo "Moving restored files to PVC..."
      cp -a /tmp/restore-staging/data/minecraft-data/. /restore/
      echo "Cleaning up staging..."
      rm -rf /tmp/restore-staging
      echo "Setting permissions..."
      chown -R 1000:1000 /restore
      echo ""
      echo "=== Restore Complete ==="
      echo "PVC contents:"
      ls -la /restore | head -30
    securityContext:
      allowPrivilegeEscalation: true
    env:
    - name: AWS_ACCESS_KEY_ID
      valueFrom:
        secretKeyRef:
          name: backblaze-credentials
          key: username
    - name: AWS_SECRET_ACCESS_KEY
      valueFrom:
        secretKeyRef:
          name: backblaze-credentials
          key: password
    - name: RESTIC_PASSWORD
      valueFrom:
        secretKeyRef:
          name: restic-repo-password
          key: password
    - name: RESTIC_REPOSITORY
      value: "s3:https://${B2_ENDPOINT}/${B2_BUCKET}"
    volumeMounts:
    - name: data
      mountPath: /restore
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: minecraft-data
EOF

  echo "Waiting for restore to complete (this may take a few minutes)..."

  # Wait for pod to complete
  local timeout=300
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    phase=$(kubectl get pod $restore_pod -n "$namespace" -o jsonpath='{.status.phase}' 2>/dev/null)
    if [ "$phase" = "Succeeded" ]; then
      echo ""
      echo "Restore completed successfully!"
      kubectl logs -n "$namespace" $restore_pod
      break
    elif [ "$phase" = "Failed" ]; then
      echo ""
      echo "Restore FAILED! Logs:"
      kubectl logs -n "$namespace" $restore_pod
      kubectl delete pod $restore_pod -n "$namespace" --ignore-not-found >/dev/null 2>&1
      exit 1
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    echo -n "."
  done

  if [ $elapsed -ge $timeout ]; then
    echo ""
    echo "Restore timed out. Check pod status:"
    echo "  kubectl get pod $restore_pod -n $namespace"
    echo "  kubectl logs $restore_pod -n $namespace"
    exit 1
  fi

  # Cleanup
  kubectl delete pod $restore_pod -n "$namespace" --ignore-not-found >/dev/null 2>&1

  echo ""
  echo "Step 3: Starting Minecraft server..."
  kubectl scale deployment minecraft -n "$namespace" --replicas=1

  echo ""
  echo "Restore complete! Server is starting..."
  echo "Check status with: kubectl get pods -n $namespace"
  exit 0
}

# Legacy K8up restore function (not used)
do_restore_k8up() {
  local namespace="server-${USER_ID}"
  local restore_name="restore-$(date +%Y%m%d-%H%M%S)"

  cat <<EOF | kubectl apply -f -
apiVersion: k8up.io/v1
kind: Restore
metadata:
  name: ${restore_name}
  namespace: ${namespace}
spec:
  snapshot: "${SNAPSHOT_ID}"
  restoreMethod:
    folder:
      claimName: minecraft-data
  backend:
    repoPasswordSecretRef:
      name: restic-repo-password
      key: password
    s3:
      endpoint: https://${B2_ENDPOINT}
      bucket: ${B2_BUCKET}
      accessKeyIDSecretRef:
        name: backblaze-credentials
        key: username
      secretAccessKeySecretRef:
        name: backblaze-credentials
        key: password
EOF

  echo ""
  echo "Waiting for restore to complete..."
  if kubectl wait --for=condition=complete job -l k8up.io/type=restore -n "$namespace" --timeout=600s 2>/dev/null; then
    echo ""
    echo "Step 3: Restore completed! Scaling deployment back up..."
    kubectl scale deployment minecraft -n "$namespace" --replicas=1

    echo ""
    echo "Restore successful!"
    echo "Server should be starting now. Check with:"
    echo "  kubectl get pods -n $namespace"
  else
    echo ""
    echo "Restore may still be in progress. Check status:"
    echo "  kubectl get restores -n $namespace"
    echo "  kubectl logs -n $namespace -l k8up.io/type=restore"
    echo ""
    echo "When complete, scale up manually:"
    echo "  kubectl scale deployment minecraft -n $namespace --replicas=1"
  fi
}

do_status() {
  local namespace="server-${USER_ID}"
  check_namespace "$namespace"

  echo "=== K8up Status for $namespace ==="
  echo ""

  echo "Schedules:"
  kubectl get schedules -n "$namespace" 2>/dev/null || echo "  None found"
  echo ""

  echo "Recent Backups:"
  kubectl get backups -n "$namespace" 2>/dev/null || echo "  None found"
  echo ""

  echo "Recent Restores:"
  kubectl get restores -n "$namespace" 2>/dev/null || echo "  None found"
  echo ""

  echo "Active Jobs:"
  kubectl get jobs -n "$namespace" -l k8up.io/type 2>/dev/null || echo "  None"
}

# Main
case "$ACTION" in
  backup)
    [ -z "$USER_ID" ] && usage
    do_backup
    ;;
  restore)
    [ -z "$USER_ID" ] && usage
    do_restore
    ;;
  list)
    [ -z "$USER_ID" ] && usage
    do_list
    ;;
  status)
    [ -z "$USER_ID" ] && usage
    do_status
    ;;
  *)
    usage
    ;;
esac
