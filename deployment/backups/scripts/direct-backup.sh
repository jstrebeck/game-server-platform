#!/bin/bash
# Direct Restic Backup Script (bypasses K8up)
# Usage: ./direct-backup.sh <backup|restore|list> <user_id> [snapshot_id]

set -e

ACTION=$1
USER_ID=$2
SNAPSHOT_ID=$3

B2_BUCKET="${K8UP_B2_BUCKET:-minecrafthosting}"
B2_ENDPOINT="${K8UP_B2_ENDPOINT:-s3.us-west-004.backblazeb2.com}"

usage() {
  echo "Direct Restic Backup Script"
  echo ""
  echo "Usage:"
  echo "  $0 backup <user_id>              - Create backup (stops server first)"
  echo "  $0 restore <user_id> <snapshot>  - Restore from snapshot"
  echo "  $0 list <user_id>                - List available snapshots"
  exit 1
}

check_namespace() {
  local ns=$1
  if ! kubectl get namespace "$ns" &>/dev/null; then
    echo "Error: Namespace $ns does not exist"
    exit 1
  fi
}

do_backup() {
  local namespace="server-${USER_ID}"
  check_namespace "$namespace"

  echo "=== Direct Backup for $namespace ==="

  # Stop server
  echo "Stopping Minecraft server..."
  kubectl scale deployment minecraft -n "$namespace" --replicas=0 2>/dev/null || true
  kubectl wait --for=delete pod -l app=minecraft -n "$namespace" --timeout=120s 2>/dev/null || sleep 10

  local pod_name="direct-backup-$(date +%s)"

  echo "Creating backup pod..."
  cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ${pod_name}
  namespace: ${namespace}
spec:
  restartPolicy: Never
  securityContext:
    runAsUser: 1000
    fsGroup: 1000
  containers:
  - name: backup
    image: restic/restic:latest
    command:
    - /bin/sh
    - -c
    - |
      echo "Starting backup..."
      echo "Contents to backup:"
      ls -la /data
      echo ""
      echo "World folder:"
      ls -la /data/world 2>/dev/null || echo "No world folder"
      echo ""
      restic backup /data --host "${namespace}" --verbose
      echo ""
      echo "Backup complete! Listing snapshots:"
      restic snapshots
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
      mountPath: /data
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: minecraft-data
EOF

  echo "Waiting for backup to complete..."
  local timeout=300
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    phase=$(kubectl get pod $pod_name -n "$namespace" -o jsonpath='{.status.phase}' 2>/dev/null)
    if [ "$phase" = "Succeeded" ]; then
      echo ""
      echo "=== Backup Logs ==="
      kubectl logs -n "$namespace" $pod_name
      kubectl delete pod $pod_name -n "$namespace" --ignore-not-found >/dev/null 2>&1
      break
    elif [ "$phase" = "Failed" ]; then
      echo ""
      echo "Backup FAILED!"
      kubectl logs -n "$namespace" $pod_name
      kubectl delete pod $pod_name -n "$namespace" --ignore-not-found >/dev/null 2>&1
      exit 1
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    echo -n "."
  done

  echo ""
  echo "Starting Minecraft server..."
  kubectl scale deployment minecraft -n "$namespace" --replicas=1
  echo "Done!"
}

do_list() {
  local namespace="server-${USER_ID}"
  check_namespace "$namespace"

  local pod_name="restic-list-$(date +%s)"

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

  sleep 10
  echo "Available snapshots:"
  kubectl logs -n "$namespace" $pod_name 2>/dev/null | grep -v "unable to open cache"
  kubectl delete pod $pod_name -n "$namespace" --ignore-not-found >/dev/null 2>&1 &
}

do_restore() {
  if [ -z "$SNAPSHOT_ID" ]; then
    echo "Error: Snapshot ID required"
    echo "Usage: $0 restore <user_id> <snapshot_id>"
    exit 1
  fi

  local namespace="server-${USER_ID}"
  check_namespace "$namespace"

  echo "=== Direct Restore for $namespace ==="
  echo "WARNING: This will stop the server, DELETE existing data, and restore from backup."
  read -p "Continue? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi

  # Stop server
  echo "Stopping Minecraft server..."
  kubectl scale deployment minecraft -n "$namespace" --replicas=0 2>/dev/null || true
  kubectl wait --for=delete pod -l app=minecraft -n "$namespace" --timeout=120s 2>/dev/null || sleep 10

  local pod_name="direct-restore-$(date +%s)"

  echo "Creating restore pod..."
  cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ${pod_name}
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
      rm -rf /data/* /data/.[!.]* /data/..?* 2>/dev/null || true
      echo "Restoring snapshot ${SNAPSHOT_ID}..."
      restic restore ${SNAPSHOT_ID} --target / --verbose || true
      echo ""
      echo "Setting permissions..."
      chown -R 1000:1000 /data
      echo ""
      echo "=== Restore Complete ==="
      echo "Contents:"
      ls -la /data
      echo ""
      echo "World folder:"
      ls -la /data/world 2>/dev/null || echo "No world folder"
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
      mountPath: /data
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: minecraft-data
EOF

  echo "Waiting for restore to complete..."
  local timeout=300
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    phase=$(kubectl get pod $pod_name -n "$namespace" -o jsonpath='{.status.phase}' 2>/dev/null)
    if [ "$phase" = "Succeeded" ]; then
      echo ""
      kubectl logs -n "$namespace" $pod_name
      kubectl delete pod $pod_name -n "$namespace" --ignore-not-found >/dev/null 2>&1
      break
    elif [ "$phase" = "Failed" ]; then
      echo ""
      echo "Restore FAILED!"
      kubectl logs -n "$namespace" $pod_name
      kubectl delete pod $pod_name -n "$namespace" --ignore-not-found >/dev/null 2>&1
      exit 1
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    echo -n "."
  done

  echo ""
  echo "Starting Minecraft server..."
  kubectl scale deployment minecraft -n "$namespace" --replicas=1
  echo "Done!"
}

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
  *)
    usage
    ;;
esac
