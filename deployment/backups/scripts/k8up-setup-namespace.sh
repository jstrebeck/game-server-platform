#!/bin/bash
# K8up Backup Setup for Individual Server Namespaces
# Usage: ./k8up-setup-namespace.sh <user_id>

set -e

USER_ID=$1
NAMESPACE="server-${USER_ID}"

# Configuration - UPDATE THESE
B2_BUCKET="${K8UP_B2_BUCKET:-minecrafthosting}"
B2_ENDPOINT="${K8UP_B2_ENDPOINT:-s3.us-west-004.backblazeb2.com}"

if [ -z "$USER_ID" ]; then
  echo "Usage: $0 <user_id>"
  echo ""
  echo "Environment variables:"
  echo "  K8UP_B2_BUCKET   - Backblaze bucket name (default: minecrafthosting)"
  echo "  K8UP_B2_ENDPOINT - Backblaze S3 endpoint (default: s3.us-west-004.backblazeb2.com)"
  exit 1
fi

echo "Setting up K8up backup for namespace: $NAMESPACE"

# Check namespace exists
if ! kubectl get namespace "$NAMESPACE" &>/dev/null; then
  echo "Error: Namespace $NAMESPACE does not exist"
  exit 1
fi

# Check backup-config namespace and secrets exist
if ! kubectl get namespace backup-config &>/dev/null; then
  echo "Error: backup-config namespace does not exist"
  echo "Create it first with the secrets. See K8UP_SETUP.md section 3."
  exit 1
fi

if ! kubectl get secret backblaze-credentials -n backup-config &>/dev/null; then
  echo "Error: backblaze-credentials secret not found in backup-config namespace"
  exit 1
fi

if ! kubectl get secret restic-repo-password -n backup-config &>/dev/null; then
  echo "Error: restic-repo-password secret not found in backup-config namespace"
  exit 1
fi

# Copy secrets to target namespace (idempotent)
echo "Copying secrets to $NAMESPACE..."
kubectl get secret backblaze-credentials -n backup-config -o yaml | \
  sed "s/namespace: backup-config/namespace: $NAMESPACE/" | \
  kubectl apply -f -

kubectl get secret restic-repo-password -n backup-config -o yaml | \
  sed "s/namespace: backup-config/namespace: $NAMESPACE/" | \
  kubectl apply -f -

# Label the namespace for backup
echo "Labeling namespace..."
kubectl label namespace "$NAMESPACE" backup=minecraft --overwrite

# Label the PVC for backup
echo "Labeling PVC minecraft-data..."
kubectl label pvc minecraft-data -n "$NAMESPACE" backup=minecraft --overwrite 2>/dev/null || \
  echo "Warning: Could not label PVC (may not exist yet)"

# Add K8up backup annotation to deployment
echo "Adding backup annotation to deployment..."
kubectl patch deployment minecraft -n "$NAMESPACE" --type=json \
  -p='[{"op": "add", "path": "/spec/template/metadata/annotations", "value": {}}, {"op": "add", "path": "/spec/template/metadata/annotations/k8up.io~1backup", "value": "true"}]' 2>/dev/null || \
kubectl patch deployment minecraft -n "$NAMESPACE" --type=json \
  -p='[{"op": "add", "path": "/spec/template/metadata/annotations/k8up.io~1backup", "value": "true"}]' 2>/dev/null || \
  echo "Warning: Could not patch deployment (may not exist yet)"

# Create K8up Schedule
echo "Creating K8up Schedule..."
cat <<EOF | kubectl apply -f -
apiVersion: k8up.io/v1
kind: Schedule
metadata:
  name: minecraft-backup
  namespace: ${NAMESPACE}
spec:
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
  backup:
    schedule: "0 3 * * *"
    keepJobs: 3
    failedJobsHistoryLimit: 2
    successfulJobsHistoryLimit: 2
  prune:
    schedule: "0 4 * * 0"
    retention:
      keepLast: 5
      keepDaily: 7
      keepWeekly: 4
  check:
    schedule: "0 5 1 * *"
EOF

echo ""
echo "K8up backup schedule created for $NAMESPACE"
echo "  - Daily backup at 3:00 AM UTC"
echo "  - Weekly prune at 4:00 AM UTC (Sundays)"
echo "  - Monthly check at 5:00 AM UTC (1st of month)"
echo ""
echo "Verify with: kubectl get schedules -n $NAMESPACE"
