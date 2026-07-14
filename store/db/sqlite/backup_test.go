package sqlite

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/internal/profile"
)

func TestCreateMigrationBackupCopiesAndValidatesWALDatabase(t *testing.T) {
	ctx := context.Background()
	database := newBackupTestDatabase(t)

	_, err := database.GetDB().ExecContext(ctx, "CREATE TABLE backup_test (value TEXT NOT NULL)")
	require.NoError(t, err)
	_, err = database.GetDB().ExecContext(ctx, "INSERT INTO backup_test (value) VALUES ('written in WAL mode')")
	require.NoError(t, err)

	backupPath, err := database.CreateMigrationBackup(ctx, "0.27.5", "0.28.1")
	require.NoError(t, err)
	require.Contains(t, filepath.Base(backupPath), "memoark-pre-migration-v0.27.5-to-v0.28.1-")
	require.True(t, strings.HasSuffix(backupPath, ".db"))
	require.NoError(t, validateSQLiteBackup(ctx, backupPath))

	info, err := os.Stat(backupPath)
	require.NoError(t, err)
	if runtime.GOOS != "windows" {
		require.Equal(t, os.FileMode(0o600), info.Mode().Perm())
	}

	backupDatabase, err := sql.Open("sqlite", backupPath)
	require.NoError(t, err)
	defer backupDatabase.Close()

	var value string
	err = backupDatabase.QueryRowContext(ctx, "SELECT value FROM backup_test").Scan(&value)
	require.NoError(t, err)
	require.Equal(t, "written in WAL mode", value)
}

func TestCreateMigrationBackupFailsWithoutChangingSource(t *testing.T) {
	ctx := context.Background()
	database := newBackupTestDatabase(t)

	_, err := database.GetDB().ExecContext(ctx, "CREATE TABLE source_test (value TEXT NOT NULL)")
	require.NoError(t, err)
	_, err = database.GetDB().ExecContext(ctx, "INSERT INTO source_test (value) VALUES ('preserve me')")
	require.NoError(t, err)

	blockedBackupPath := filepath.Join(database.profile.Data, migrationBackupDirectory)
	require.NoError(t, os.WriteFile(blockedBackupPath, []byte("not a directory"), 0o600))

	backupPath, err := database.CreateMigrationBackup(ctx, "0.27.5", "0.28.1")
	require.Error(t, err)
	require.Empty(t, backupPath)

	var value string
	err = database.GetDB().QueryRowContext(ctx, "SELECT value FROM source_test").Scan(&value)
	require.NoError(t, err)
	require.Equal(t, "preserve me", value)
}

func TestSanitizeBackupFilenamePart(t *testing.T) {
	require.Equal(t, "0.27.5", sanitizeBackupFilenamePart("0.27.5"))
	require.Equal(t, ".._unsafe_version", sanitizeBackupFilenamePart("../unsafe version"))
	require.Equal(t, "unknown", sanitizeBackupFilenamePart(""))
}

func newBackupTestDatabase(t *testing.T) *DB {
	t.Helper()

	dataDirectory := t.TempDir()
	driver, err := NewDB(&profile.Profile{
		Data:   dataDirectory,
		DSN:    filepath.Join(dataDirectory, "source.db"),
		Driver: "sqlite",
	})
	require.NoError(t, err)

	database, ok := driver.(*DB)
	require.True(t, ok)
	t.Cleanup(func() {
		require.NoError(t, database.Close())
	})
	return database
}
