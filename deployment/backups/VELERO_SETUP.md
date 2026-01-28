# Velero Backup Setup for Watch2Play

This guide covers installing Velero with Backblaze B2 storage for backing up Minecraft server PVCs.

## Prerequisites

- kubectl configured with cluster access
- Velero CLI installed
- Backblaze B2 account with a bucket created

## 1. Install Velero CLI

```bash
# Download latest Velero CLI (check https://github.com/vmware-tanzu/velero/releases for latest version)
VELERO_VERSION="v1.13.0"
wget https://github.com/vmware-tanzu/velero/releases/download/${VELERO_VERSION}/velero-${VELERO_VERSION}-linux-amd64.tar.gz
tar -xvf velero-${VELERO_VERSION}-linux-amd64.tar.gz
sudo mv velero-${VELERO_VERSION}-linux-amd64/velero /usr/local/bin/
velero version --client-only
```

## 2. Create Backblaze B2 Credentials

Create a Backblaze application key with read/write access to your bucket.

```bash
# Create credentials file
cat > /tmp/backblaze-credentials <<EOF
[default]
aws_access_key_id = YOUR_B2_APPLICATION_KEY_ID
aws_secret_access_key = YOUR_B2_APPLICATION_KEY
EOF
```

Replace with your actual B2 credentials:
- `YOUR_B2_APPLICATION_KEY_ID`: The keyID from Backblaze
- `YOUR_B2_APPLICATION_KEY`: The applicationKey from Backblaze

# Create secret
kubectl create secret generic cloud-credentials \
  -n velero \
  --from-file=cloud=/tmp/backblaze-credentials


## 3. Install Velero with Reduced Resource Requirements

The default Velero installation requests 500m CPU and 128Mi memory. For smaller clusters, we reduce these.

```bash
# Set your Backblaze bucket details
B2_BUCKET_NAME="your-bucket-name"
B2_REGION="us-west-004"  # Check your bucket's endpoint region

# Install Velero with S3-compatible backend (Backblaze B2)
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.0.0 \
  --bucket ${B2_BUCKET_NAME} \
  --secret-file /tmp/backblaze-credentials \
  --backup-location-config \
    region=${B2_REGION},s3ForcePathStyle=true,s3Url=https://s3.${B2_REGION}.backblazeb2.com \
  --use-volume-snapshots=false \
  --use-node-agent \
  --velero-pod-cpu-request 100m \
  --velero-pod-cpu-limit 500m \
  --velero-pod-mem-request 64Mi \
  --velero-pod-mem-limit 256Mi \
  --node-agent-pod-cpu-request 50m \
  --node-agent-pod-cpu-limit 200m \
  --node-agent-pod-mem-request 64Mi \
  --node-agent-pod-mem-limit 256Mi

# Clean up credentials file
rm /tmp/backblaze-credentials
```

### Resource Settings Explained

| Component | Default CPU Request | Reduced CPU Request |
|-----------|---------------------|---------------------|
| Velero Pod | 500m | 100m |
| Node Agent | 500m | 50m |

## 4. Verify Installation

```bash
# Check Velero deployment
kubectl get pods -n velero

# Check backup location status
velero backup-location get

# Should show "Available" status
```

## 5. Configure Scheduled Backups

### Label Minecraft Server Namespaces

First, ensure all server namespaces are labeled for backup selection:

```bash
# Label all existing server namespaces
for ns in $(kubectl get namespaces -o name | grep "server-"); do
  kubectl label $ns backup=minecraft --overwrite
done
```

### Create Daily Backup Schedule

```bash
# Create schedule for all minecraft server PVCs
# Runs daily at 3:00 AM UTC, retains backups for 7 days
velero schedule create minecraft-daily \
  --schedule="0 3 * * *" \
  --selector backup=minecraft \
  --include-namespaces="" \
  --include-resources persistentvolumeclaims,persistentvolumes \
  --ttl 168h \
  --default-volumes-to-fs-backup

# Create weekly backup with longer retention (30 days)
velero schedule create minecraft-weekly \
  --schedule="0 4 * * 0" \
  --selector backup=minecraft \
  --include-namespaces="" \
  --include-resources persistentvolumeclaims,persistentvolumes \
  --ttl 720h \
  --default-volumes-to-fs-backup
```

### Alternative: Backup by Namespace Pattern

If namespace labels aren't reliable, use a cron job to backup each server namespace:

```bash
# Create a ConfigMap with backup script
kubectl create configmap backup-script -n velero --from-file=backup-all.sh=./scripts/backup-all-servers.sh
```

## 6. Verify Scheduled Backups

```bash
# List all schedules
velero schedule get

# View schedule details
velero schedule describe minecraft-daily

# List all backups
velero backup get

# Check backup logs
velero backup logs <backup-name>
```

## 7. Manual Backup Commands

```bash
# Backup a specific user's server
velero backup create user-alice-manual \
  --include-namespaces server-alice \
  --default-volumes-to-fs-backup \
  --wait

# Backup all minecraft servers now
velero backup create minecraft-all-$(date +%Y%m%d-%H%M) \
  --selector backup=minecraft \
  --default-volumes-to-fs-backup \
  --wait
```

## 8. Restore Commands

```bash
# Restore a specific backup
velero restore create --from-backup user-alice-manual

# Restore to a different namespace (for testing)
velero restore create \
  --from-backup user-alice-manual \
  --namespace-mappings server-alice:server-alice-restored
```

## Troubleshooting

### Check Velero Logs
```bash
kubectl logs -n velero deployment/velero
kubectl logs -n velero -l name=node-agent
```

### Verify B2 Connection
```bash
velero backup-location get
# Status should be "Available"
```

### Common Issues

1. **"BackupStorageLocation is unavailable"**: Check B2 credentials and bucket permissions
2. **"No volumes to backup"**: Ensure `--default-volumes-to-fs-backup` flag is used
3. **Node agent not running**: Check node agent DaemonSet: `kubectl get ds -n velero`

## Uninstall

```bash
velero uninstall
```
