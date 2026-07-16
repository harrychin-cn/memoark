//go:build android

package sqlite

import (
	"context"
	"database/sql"

	"github.com/mattn/go-sqlite3"
	"github.com/pkg/errors"
)

func copySQLiteConnectionToBackup(ctx context.Context, driverConnection any, backupPath string) error {
	source, ok := driverConnection.(*sqlite3.SQLiteConn)
	if !ok {
		return errors.New("go-sqlite3 connection does not support online backup")
	}

	destinationDatabase, err := sql.Open("sqlite", backupPath)
	if err != nil {
		return errors.Wrap(err, "failed to open SQLite backup destination")
	}
	defer destinationDatabase.Close()

	destinationConnection, err := destinationDatabase.Conn(ctx)
	if err != nil {
		return errors.Wrap(err, "failed to acquire SQLite backup destination connection")
	}
	defer destinationConnection.Close()

	return destinationConnection.Raw(func(rawDestination any) error {
		destination, ok := rawDestination.(*sqlite3.SQLiteConn)
		if !ok {
			return errors.New("go-sqlite3 backup destination connection is unavailable")
		}

		backup, err := destination.Backup("main", source, "main")
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
