# K8up Backup Setup for Watch2Play

K8up is a Kubernetes-native backup operator using Restic. It backs up PVCs to S3-compatible storage (Backblaze B2).

## Automatic Setup

When a user creates a new server, the backend automatically:
1. Labels the namespace with `backup=minecraft`
2. Labels the PVC with `backup=minecraft`
3. Adds `k8up.io/backup: "true"` annotation to the pod template (tells K8up what to backup)
4. Copies backup secrets from `backup-config` namespace
5. Creates a K8up Schedule CR for daily backups

**You only need to:**
1. Install K8up operator (Section 2)
2. Create the backup-config namespace with secrets (Section 3)

### Backend Environment Variables

The backend uses these environment variables for K8up configuration:

| Variable | Default | Description |
|----------|---------|-------------|
| `K8UP_BACKUP_CONFIG_NAMESPACE` | `backup-config` | Namespace containing backup secrets |
| `K8UP_B2_BUCKET` | `minecrafthosting` | Backblaze B2 bucket name |
| `K8UP_B2_ENDPOINT` | `s3.us-west-004.backblazeb2.com` | Backblaze S3 endpoint |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Cluster                                                        │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │ server-alice     │    │ server-bob       │                   │
│  │ ┌──────────────┐ │    │ ┌──────────────┐ │                   │
│  │ │minecraft-data│ │    │ │minecraft-data│ │                   │
│  │ │    (PVC)     │ │    │ │    (PVC)     │ │                   │
│  │ └──────────────┘ │    │ └──────────────┘ │                   │
│  └────────┬─────────┘    └────────┬─────────┘                   │
│           │                       │                             │
│           └───────────┬───────────┘                             │
│                       ▼                                         │
│           ┌───────────────────────┐                             │
│           │   K8up Operator       │                             │
│           │   (k8up-system ns)    │                             │
│           └───────────┬───────────┘                             │
│                       │                                         │
└───────────────────────┼─────────────────────────────────────────┘
                        ▼
              ┌─────────────────────┐
              │   Backblaze B2      │
              │   (S3-compatible)   │
              └─────────────────────┘
```

## Prerequisites

- kubectl configured with cluster access
- Helm 3 installed
- Backblaze B2 account with bucket created

## 1. Create Backblaze B2 Bucket & Application Key

1. Log in to Backblaze B2: https://secure.backblaze.com/b2_buckets.htm
2. Create a new bucket (e.g., `minecrafthosting`)
3. Note the bucket **Endpoint** (e.g., `s3.us-west-004.backblazeb2.com`)
4. Create an Application Key with read/write access to this bucket
5. Save the `keyID` and `applicationKey`

## 2. Install K8up Operator

```bash
# Install CRDs first (required - Helm chart does not include them)
kubectl apply -f k8up-crd.yaml

# Add K8up Helm repository
helm repo add k8up-io https://k8up-io.github.io/k8up
helm repo update

# Create namespace
kubectl create namespace k8up-system

# Install K8up operator with reduced resources
helm install k8up k8up-io/k8up \
  --namespace k8up-system \
  --set k8up.operator.resources.requests.cpu=50m \
  --set k8up.operator.resources.requests.memory=64Mi \
  --set k8up.operator.resources.limits.cpu=200m \
  --set k8up.operator.resources.limits.memory=256Mi
```

**Important:** Always upgrade CRDs before upgrading the Helm release:
```bash
# Check latest version at https://github.com/k8up-io/k8up/releases
kubectl apply -f https://github.com/k8up-io/k8up/releases/download/k8up-${K8UP_VERSION}/k8up-crd.yaml --server-side
helm upgrade k8up k8up-io/k8up --namespace k8up-system
```

### Verify Installation

```bash
kubectl get pods -n k8up-system
# Should show k8up-operator pod running
```

## 3. Create Backblaze Credentials Secret

Create this secret in a central namespace (we'll reference it from each server namespace):

```bash
# Create namespace for shared backup resources
kubectl create namespace backup-config

# Create the S3 credentials secret
kubectl create secret generic backblaze-credentials \
  --namespace backup-config \
  --from-literal=username=YOUR_B2_KEY_ID \
  --from-literal=password=YOUR_B2_APPLICATION_KEY

# Create Restic repository password secret
kubectl create secret generic restic-repo-password \
  --namespace backup-config \
  --from-literal=password=YOUR_RESTIC_ENCRYPTION_PASSWORD
```

**Important:** Replace:
- `YOUR_B2_KEY_ID` - Backblaze keyID
- `YOUR_B2_APPLICATION_KEY` - Backblaze applicationKey
- `YOUR_RESTIC_ENCRYPTION_PASSWORD` - Strong password for encrypting backups (SAVE THIS - needed for restores!)

## 4. Configure Existing Servers (created before K8up setup)

New servers automatically get labels, annotations, and backup configuration. For existing servers, you need to:

1. Label the namespace and PVC
2. Add the `k8up.io/backup: "true"` annotation to the pod template (tells K8up which volumes to backup)

```bash
# Configure all existing server namespaces
for ns in $(kubectl get namespaces -o name | grep "server-"); do
  ns_name=$(echo $ns | cut -d'/' -f2)

  # Label namespace and PVC
  kubectl label namespace $ns_name backup=minecraft --overwrite 2>/dev/null || true
  kubectl label pvc minecraft-data -n $ns_name backup=minecraft --overwrite 2>/dev/null || true

  # Add backup annotation to pod template (required for K8up to know what to backup)
  kubectl patch deployment minecraft -n $ns_name --type=json \
    -p='[{"op": "add", "path": "/spec/template/metadata/annotations/k8up.io~1backup", "value": "true"}]' 2>/dev/null || true
done
```

**Important:** The `k8up.io/backup: "true"` annotation on the pod template is what tells K8up to backup the volumes mounted by that pod. Without this annotation, K8up won't backup anything.

## 5. Setup Backup for Existing Namespaces

New servers automatically get backup configuration. For existing servers, use the setup script:

### Create Setup Script

Save as `deployment/backups/scripts/k8up-setup-namespace.sh`:

```bash
#!/bin/bash
# Usage: ./k8up-setup-namespace.sh <user_id>

USER_ID=$1
NAMESPACE="server-${USER_ID}"
B2_BUCKET="minecrafthosting"
B2_ENDPOINT="s3.us-west-004.backblazeb2.com"  # Update with your region

if [ -z "$USER_ID" ]; then
  echo "Usage: $0 <user_id>"
  exit 1
fi

# Check namespace exists
if ! kubectl get namespace "$NAMESPACE" &>/dev/null; then
  echo "Namespace $NAMESPACE does not exist"
  exit 1
fi

# Copy secrets to target namespace
kubectl get secret backblaze-credentials -n backup-config -o yaml | \
  sed "s/namespace: backup-config/namespace: $NAMESPACE/" | \
  kubectl apply -f -

kubectl get secret restic-repo-password -n backup-config -o yaml | \
  sed "s/namespace: backup-config/namespace: $NAMESPACE/" | \
  kubectl apply -f -

# Create K8up Schedule
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
    schedule: "0 3 * * *"  # Daily at 3 AM UTC
    keepJobs: 3
    failedJobsHistoryLimit: 2
    successfulJobsHistoryLimit: 2
  prune:
    schedule: "0 4 * * 0"  # Weekly on Sunday at 4 AM
    retention:
      keepLast: 5
      keepDaily: 7
      keepWeekly: 4
  check:
    schedule: "0 5 1 * *"  # Monthly on 1st at 5 AM
EOF

echo "K8up backup schedule created for $NAMESPACE"
```

Make it executable:
```bash
chmod +x deployment/backups/scripts/k8up-setup-namespace.sh
```

### Setup All Existing Namespaces

```bash
for ns in $(kubectl get namespaces -o name | grep "server-"); do
  user_id=$(echo $ns | cut -d'/' -f2 | sed 's/server-//')
  ./deployment/backups/scripts/k8up-setup-namespace.sh "$user_id"
done
```

## 6. Manual Backup Commands

### Trigger Immediate Backup for a User

```bash
# Create a one-time backup job
USER_ID="alice"
NAMESPACE="server-${USER_ID}"

cat <<EOF | kubectl apply -f -
apiVersion: k8up.io/v1
kind: Backup
metadata:
  name: manual-backup-$(date +%Y%m%d-%H%M%S)
  namespace: ${NAMESPACE}
spec:
  failedJobsHistoryLimit: 2
  successfulJobsHistoryLimit: 2
  backend:
    repoPasswordSecretRef:
      name: restic-repo-password
      key: password
    s3:
      endpoint: https://s3.us-west-004.backblazeb2.com
      bucket: minecrafthosting
      accessKeyIDSecretRef:
        name: backblaze-credentials
        key: username
      secretAccessKeySecretRef:
        name: backblaze-credentials
        key: password
EOF
```

### Check Backup Status

```bash
# List all backups in a namespace
kubectl get backups -n server-alice

# Get backup details
kubectl describe backup <backup-name> -n server-alice

# Check backup job logs
kubectl logs -n server-alice -l k8up.io/type=backup
```

## 7. Restore Commands

### List Available Snapshots

```bash
USER_ID="alice"
NAMESPACE="server-${USER_ID}"

# Create a Check job to list snapshots
cat <<EOF | kubectl apply -f -
apiVersion: k8up.io/v1
kind: Check
metadata:
  name: list-snapshots-$(date +%Y%m%d-%H%M%S)
  namespace: ${NAMESPACE}
spec:
  backend:
    repoPasswordSecretRef:
      name: restic-repo-password
      key: password
    s3:
      endpoint: https://s3.us-west-004.backblazeb2.com
      bucket: minecrafthosting
      accessKeyIDSecretRef:
        name: backblaze-credentials
        key: username
      secretAccessKeySecretRef:
        name: backblaze-credentials
        key: password
EOF

# View snapshots (wait for job to complete)
kubectl logs -n $NAMESPACE -l k8up.io/type=check --tail=100
```

### Restore a Specific Snapshot

**Important:** Before restoring, you must stop the Minecraft server to avoid data corruption.

```bash
USER_ID="alice"
NAMESPACE="server-${USER_ID}"
SNAPSHOT_ID="abc123"  # Get from list-snapshots output

# 1. Scale down the Minecraft deployment
kubectl scale deployment minecraft -n $NAMESPACE --replicas=0

# 2. Wait for pod to terminate
kubectl wait --for=delete pod -l app=minecraft -n $NAMESPACE --timeout=60s 2>/dev/null || true

# 3. Create restore job
cat <<EOF | kubectl apply -f -
apiVersion: k8up.io/v1
kind: Restore
metadata:
  name: restore-$(date +%Y%m%d-%H%M%S)
  namespace: ${NAMESPACE}
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
      endpoint: https://s3.us-west-004.backblazeb2.com
      bucket: minecrafthosting
      accessKeyIDSecretRef:
        name: backblaze-credentials
        key: username
      secretAccessKeySecretRef:
        name: backblaze-credentials
        key: password
EOF

# 4. Wait for restore to complete
kubectl wait --for=condition=completed job -l k8up.io/type=restore -n $NAMESPACE --timeout=300s

# 5. Scale deployment back up
kubectl scale deployment minecraft -n $NAMESPACE --replicas=1
```

## 8. Testing Backup & Restore

### Full Test Procedure

```bash
#!/bin/bash
# Test backup and restore for a specific user

USER_ID="test-user"
NAMESPACE="server-${USER_ID}"

echo "=== Step 1: Create test marker file ==="
POD=$(kubectl get pod -n $NAMESPACE -l app=minecraft -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n $NAMESPACE $POD -- sh -c 'echo "backup-test-$(date +%s)" > /data/world/backup-test.txt'
kubectl exec -n $NAMESPACE $POD -- cat /data/world/backup-test.txt

echo "=== Step 2: Trigger backup ==="
BACKUP_NAME="test-backup-$(date +%Y%m%d-%H%M%S)"
cat <<EOF | kubectl apply -f -
apiVersion: k8up.io/v1
kind: Backup
metadata:
  name: ${BACKUP_NAME}
  namespace: ${NAMESPACE}
spec:
  backend:
    repoPasswordSecretRef:
      name: restic-repo-password
      key: password
    s3:
      endpoint: https://s3.us-west-004.backblazeb2.com
      bucket: minecrafthosting
      accessKeyIDSecretRef:
        name: backblaze-credentials
        key: username
      secretAccessKeySecretRef:
        name: backblaze-credentials
        key: password
EOF

echo "Waiting for backup to complete..."
sleep 10
kubectl wait --for=condition=completed job -l k8up.io/type=backup -n $NAMESPACE --timeout=300s

echo "=== Step 3: Delete test file ==="
kubectl exec -n $NAMESPACE $POD -- rm /data/world/backup-test.txt
kubectl exec -n $NAMESPACE $POD -- ls /data/world/backup-test.txt 2>&1 || echo "File deleted (expected)"

echo "=== Step 4: Get snapshot ID ==="
# You need to check the backup job logs for the snapshot ID
kubectl logs -n $NAMESPACE -l k8up.io/type=backup --tail=50

echo ""
echo "=== Next Steps ==="
echo "1. Get snapshot ID from logs above"
echo "2. Run restore with: SNAPSHOT_ID=<id> ./restore.sh $USER_ID"
```

## 9. Monitoring & Troubleshooting

### Check K8up Operator Logs

```bash
kubectl logs -n k8up-system -l app.kubernetes.io/name=k8up
```

### List All Backup Resources

```bash
# All backup schedules
kubectl get schedules --all-namespaces

# All backup jobs
kubectl get backups --all-namespaces

# All restore jobs
kubectl get restores --all-namespaces
```

### Common Issues

1. **Backup job stuck in pending**
   - Check if the PVC is mounted by a running pod (K8up can backup mounted PVCs)
   - Check K8up operator logs for errors

2. **S3 authentication errors**
   - Verify credentials: `kubectl get secret backblaze-credentials -n <namespace> -o yaml`
   - Test B2 connection with aws-cli

3. **Restore not working**
   - Ensure the minecraft deployment is scaled to 0
   - Check the restore job logs: `kubectl logs -n <namespace> -l k8up.io/type=restore`

## 10. Cleanup Old Backups

K8up handles pruning automatically via the Schedule CR. To manually prune:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: k8up.io/v1
kind: Prune
metadata:
  name: manual-prune-$(date +%Y%m%d)
  namespace: server-alice
spec:
  retention:
    keepLast: 5
    keepDaily: 7
  backend:
    repoPasswordSecretRef:
      name: restic-repo-password
      key: password
    s3:
      endpoint: https://s3.us-west-004.backblazeb2.com
      bucket: minecrafthosting
      accessKeyIDSecretRef:
        name: backblaze-credentials
        key: username
      secretAccessKeySecretRef:
        name: backblaze-credentials
        key: password
EOF
```

## Comparison: K8up vs Velero

| Feature | K8up | Velero |
|---------|------|--------|
| Backup Method | Restic (file-level) | Restic or Volume Snapshots |
| Per-namespace config | Schedule CR per namespace | Global schedules with selectors |
| Encryption | Built-in (Restic) | Requires configuration |
| Resource usage | Lower | Higher |
| Complexity | Simpler for PVC-only | Better for full cluster |
| S3 Compatible | Yes | Yes |

## Uninstall

```bash
# Remove K8up operator
helm uninstall k8up -n k8up-system

# Remove namespace
kubectl delete namespace k8up-system

# Remove CRDs (optional - WARNING: this deletes ALL backup configs across all namespaces!)
kubectl delete crd \
  backups.k8up.io \
  checks.k8up.io \
  prunes.k8up.io \
  restores.k8up.io \
  schedules.k8up.io \
  archivals.k8up.io \
  prebackuppods.k8up.io \
  snapshots.k8up.io
```
