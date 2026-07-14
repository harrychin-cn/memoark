package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pkg/errors"
	msqlite "modernc.org/sqlite"
)

const migrationBackupDirectory = "backups"

type onlineBackuper interface {
	NewBackup(destinationURI string) (*msqlite.Backup, error)
}

// CreateMigrationBackup creates and verifies a consistent online SQLite
// backup before schema migrations modify the source database.
func (d *DB) CreateMigrationBackup(ctx context.Context, sourceSchemaVersion, targetSchemaVersion string) (backupPath string, err error) {
	backupDirectory := filepath.Join(d.profile.Data, migrationBackupDirectory)
	if err := os.MkdirAll(backupDirectory, 0o700); err != nil {
		return "", errors.Wrapf(err, "failed to create backup directory %s", backupDirectory)
	}

	timestamp := time.Now().UTC().Format("20060102T150405.000000000Z")
	filename := fmt.Sprintf(
		"memoark-pre-migration-v%s-to-v%s-%s.db",
		sanitizeBackupFilenamePart(sourceSchemaVersion),
		sanitizeBackupFilenamePart(targetSchemaVersion),
		timestamp,
	)
	backupPath = filepath.Join(backupDirectory, filename)

	file, err := os.OpenFile(backupPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return "", errors.Wrapf(err, "failed to reserve backup file %s", backupPath)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(backupPath)
		return "", errors.Wrapf(err, "failed to close reserved backup file %s", backupPath)
	}

	completed := false
	defer func() {
		if !completed {
			_ = os.Remove(backupPath)
		}
	}()

	if err := d.copyDatabaseToBackup(ctx, backupPath); err != nil {
		return "", errors.Wrapf(err, "failed to write SQLite backup %s", backupPath)
	}
	if err := validateSQLiteBackup(ctx, backupPath); err != nil {
		return "", errors.Wrapf(err, "failed to validate SQLite backup %s", backupPath)
	}

	completed = true
	return backupPath, nil
}

func (d *DB) copyDatabaseToBackup(ctx context.Context, backupPath string) error {
	connection, err := d.db.Conn(ctx)
	if err != nil {
		return errors.Wrap(err, "failed to acquire SQLite connection")
	}
	defer connection.Close()

	return connection.Raw(func(driverConnection any) error {
		backuper, ok := driverConnection.(onlineBackuper)
		if !ok {
			return errors.New("modernc SQLite connection does not support online backup")
		}

		backup, err := backuper.NewBackup(backupPath)
		if err != nil {
			return errors.Wrap(err, "failed to initialize online backup")
		}

		morePages, stepErr := backup.Step(-1)
		finishErr := backup.Finish()
		if stepErr != nil {
			if finishErr != nil {
				return errors.Wrapf(stepErr, "failed to copy SQLite pages; backup cleanup also failed: %v", finishErr)
			}
			return errors.Wrap(stepErr, "failed to copy SQLite pages")
		}
		if finishErr != nil {
			return errors.Wrap(finishErr, "failed to finish online backup")
		}
		if morePages {
			return errors.New("online backup did not copy all SQLite pages")
		}
		return nil
	})
}

func validateSQLiteBackup(ctx context.Context, backupPath string) error {
	normalizedPath := filepath.ToSlash(backupPath)
	if filepath.VolumeName(backupPath) != "" && !strings.HasPrefix(normalizedPath, "/") {
		normalizedPath = "/" + normalizedPath
	}
	backupURL := &url.URL{Scheme: "file", Path: normalizedPath}
	query := backupURL.Query()
	query.Set("mode", "ro")
	backupURL.RawQuery = query.Encode()

	database, err := sql.Open("sqlite", backupURL.String())
	if err != nil {
		return errors.Wrap(err, "failed to open backup for validation")
	}
	defer database.Close()

	rows, err := database.QueryContext(ctx, "PRAGMA integrity_check")
	if err != nil {
		return errors.Wrap(err, "failed to run PRAGMA integrity_check")
	}
	defer rows.Close()

	results := []string{}
	for rows.Next() {
		var result string
		if err := rows.Scan(&result); err != nil {
			return errors.Wrap(err, "failed to read integrity_check result")
		}
		results = append(results, result)
	}
	if err := rows.Err(); err != nil {
		return errors.Wrap(err, "failed while reading integrity_check results")
	}
	if len(results) != 1 || results[0] != "ok" {
		return errors.Errorf("integrity_check returned %q", results)
	}
	return nil
}

func sanitizeBackupFilenamePart(value string) string {
	if value == "" {
		return "unknown"
	}

	var builder strings.Builder
	for _, character := range value {
		if character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' || character >= '0' && character <= '9' || character == '.' || character == '-' || character == '_' {
			builder.WriteRune(character)
		} else {
			builder.WriteByte('_')
		}
	}
	return builder.String()
}
