# SQLite migration backups and restore

MemoArk automatically creates a verified SQLite backup when an existing database has pending schema migrations. Fresh installations
and databases that already use the current schema do not create a backup.

## Backup location and logs

Backups are stored under the configured data directory:

```text
<data-directory>/backups/memoark-pre-migration-v<SOURCE>-to-v<TARGET>-<UTC-TIMESTAMP>.db
```

The default Docker location is `/var/opt/memos/backups`, which is inside the same persistent volume as `memos_prod.db`. Docker logs
include the backup path, source schema version, and target schema version after `PRAGMA integrity_check` returns `ok`.

MemoArk stops before running any migration SQL if the backup cannot be created or verified. A backup is retained when it was verified
successfully but a later migration step fails.

## Restore a backup

Restoring rolls the database back to the schema version in the backup. Use a MemoArk or Memos image compatible with that source schema.
Starting the restored database with the newer image will run the pending migration again.

1. Stop MemoArk completely so no process is writing the database.
2. Copy the current `memos_prod.db`, `memos_prod.db-wal`, and `memos_prod.db-shm` files to a separate recovery directory if they exist.
3. Verify the chosen backup before replacing anything:

   ```bash
   sqlite3 /var/opt/memos/backups/<backup-file>.db "PRAGMA integrity_check;"
   ```

   Continue only when the command prints `ok`.
4. Remove the stopped database's `memos_prod.db-wal` and `memos_prod.db-shm` files. Never remove these files while MemoArk is running.
5. Copy the verified backup to the database path:

   ```bash
   cp /var/opt/memos/backups/<backup-file>.db /var/opt/memos/memos_prod.db
   chown 10001:10001 /var/opt/memos/memos_prod.db
   chmod 600 /var/opt/memos/memos_prod.db
   ```

6. Start the image compatible with the source schema version recorded in the backup filename.
7. Confirm that MemoArk starts, recent notes are readable, and the logs contain no database errors before deleting the recovery copy
   made in step 2.

For a Docker named volume, run the copy and verification commands from a temporary container with that volume mounted. For a host bind
mount, perform the same steps directly in the mounted host directory while the MemoArk container is stopped.

## Current limits

- Automatic migration backups apply only to SQLite.
- MemoArk does not upload, prune, schedule, or restore backups automatically.
- Attachments stored outside SQLite are not included in the database backup.
