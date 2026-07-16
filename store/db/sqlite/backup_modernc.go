//go:build !android

package sqlite

import (
	"context"

	"github.com/pkg/errors"
	msqlite "modernc.org/sqlite"
)

type onlineBackuper interface {
	NewBackup(destinationURI string) (*msqlite.Backup, error)
}

func copySQLiteConnectionToBackup(_ context.Context, driverConnection any, backupPath string) error {
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
}
