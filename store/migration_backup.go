package store

import (
	"context"
	"log/slog"

	"github.com/pkg/errors"
)

type migrationBackuper interface {
	CreateMigrationBackup(ctx context.Context, sourceSchemaVersion, targetSchemaVersion string) (string, error)
}

func (s *Store) createPreMigrationBackup(ctx context.Context, sourceSchemaVersion, targetSchemaVersion string) error {
	if s.profile.Driver != "sqlite" {
		return nil
	}

	backuper, ok := s.driver.(migrationBackuper)
	if !ok {
		return errors.New("sqlite driver does not support pre-migration backups")
	}

	slog.Info("creating SQLite pre-migration backup",
		slog.String("sourceSchemaVersion", getSchemaVersionOrDefault(sourceSchemaVersion)),
		slog.String("targetSchemaVersion", targetSchemaVersion),
	)
	backupPath, err := backuper.CreateMigrationBackup(ctx, getSchemaVersionOrDefault(sourceSchemaVersion), targetSchemaVersion)
	if err != nil {
		return errors.Wrap(err, "failed to create and verify SQLite backup")
	}

	slog.Info("SQLite pre-migration backup verified",
		slog.String("backupPath", backupPath),
		slog.String("sourceSchemaVersion", getSchemaVersionOrDefault(sourceSchemaVersion)),
		slog.String("targetSchemaVersion", targetSchemaVersion),
	)
	return nil
}
