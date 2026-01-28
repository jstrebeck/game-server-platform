# Velero Quick Reference

## Manual Backup/Restore for Single User

```bash
# Backup a user's server
./scripts/minecraft-backup.sh backup alice --wait

# List user's backups
./scripts/minecraft-backup.sh list alice

# Restore from backup
./scripts/minecraft-backup.sh restore alice --backup minecraft-manual-alice-20240115-1430 --wait

# Delete a backup
./scripts/minecraft-backup.sh delete alice --backup minecraft-manual-alice-20240115-1430
```

## Backup All Servers

```bash
# Backup all servers (async)
./scripts/backup-all-servers.sh

# Backup all servers (wait for completion)
./scripts/backup-all-servers.sh 168h --wait
```

## Velero CLI Commands

```bash
# Check status
velero backup-location get
kubectl get pods -n velero

# List backups
velero backup get

# Backup details
velero backup describe <name>
velero backup logs <name>

# List restores
velero restore get
velero restore describe <name>

# List schedules
velero schedule get

# Trigger scheduled backup now
velero backup create --from-schedule minecraft-daily
```

## Emergency Restore

```bash
# 1. Stop the server
kubectl scale deployment minecraft -n server-USERNAME --replicas=0

# 2. Delete existing PVC
kubectl delete pvc minecraft-data -n server-USERNAME

# 3. Restore from backup
velero restore create restore-USERNAME-emergency --from-backup BACKUP_NAME --wait

# 4. Start the server
kubectl scale deployment minecraft -n server-USERNAME --replicas=1
```

## Troubleshooting

```bash
# Velero logs
kubectl logs -n velero deployment/velero

# Node agent logs (for PVC backups)
kubectl logs -n velero -l name=node-agent

# Check backup storage
velero backup-location get
```
