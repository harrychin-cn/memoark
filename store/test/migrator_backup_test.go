package test

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/internal/profile"
	"github.com/usememos/memos/internal/version"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
	"github.com/usememos/memos/store/db"
)

const migrationBackupSourceVersion = "0.27.5"

func TestSQLitePendingMigrationCreatesVerifiedBackup(t *testing.T) {
	if getDriverFromEnv() != "sqlite" {
		t.Skip("SQLite migration backups do not apply to other drivers")
	}

	ctx := context.Background()
	dataDirectory, dsn, targetVersion := createPendingSQLiteBackupFixture(ctx, t)
	testingStore := openSQLiteBackupTestingStore(t, dataDirectory, dsn)
	defer testingStore.Close()

	require.Empty(t, listMigrationBackupFiles(t, dataDirectory))
	require.NoError(t, testingStore.Migrate(ctx))

	backupFiles := listMigrationBackupFiles(t, dataDirectory)
	require.Len(t, backupFiles, 1)
	backupPath := backupFiles[0]
	backupName := filepath.Base(backupPath)
	require.Contains(t, backupName, "v"+migrationBackupSourceVersion+"-to-v"+targetVersion+"-")
	require.True(t, strings.HasSuffix(backupName, "Z.db"), "backup filename should contain a UTC timestamp")
	requireSQLiteIntegrityOK(t, backupPath)

	sourceSetting, err := testingStore.GetInstanceBasicSetting(ctx)
	require.NoError(t, err)
	require.Equal(t, targetVersion, sourceSetting.SchemaVersion)

	sourceDatabase := testingStore.GetDriver().GetDB()
	sourceHasTargetTable, err := tableExists(ctx, sourceDatabase, "sqlite", "user_identity")
	require.NoError(t, err)
	require.True(t, sourceHasTargetTable)
	requireSQLiteMemoContent(t, sourceDatabase, "pre-migration-sentinel", "preserve through migration")

	backupDatabase, err := sql.Open("sqlite", backupPath)
	require.NoError(t, err)
	defer backupDatabase.Close()
	require.Equal(t, migrationBackupSourceVersion, readSQLiteSchemaVersion(t, backupDatabase))
	backupHasTargetTable, err := tableExists(ctx, backupDatabase, "sqlite", "user_identity")
	require.NoError(t, err)
	require.False(t, backupHasTargetTable, "backup must retain the old schema")
	requireSQLiteMemoContent(t, backupDatabase, "pre-migration-sentinel", "preserve through migration")

	require.NoError(t, testingStore.Migrate(ctx))
	require.Len(t, listMigrationBackupFiles(t, dataDirectory), 1, "a current database must not create another backup")
}

func TestSQLiteFreshAndCurrentDatabaseCreateNoMigrationBackup(t *testing.T) {
	if getDriverFromEnv() != "sqlite" {
		t.Skip("SQLite migration backups do not apply to other drivers")
	}

	ctx := context.Background()
	dataDirectory := t.TempDir()
	dsn := filepath.Join(dataDirectory, "memos_prod.db")
	testingStore := openSQLiteBackupTestingStore(t, dataDirectory, dsn)
	defer testingStore.Close()

	require.NoError(t, testingStore.Migrate(ctx))
	require.Empty(t, listMigrationBackupFiles(t, dataDirectory), "fresh initialization must not create a backup")
	require.NoError(t, testingStore.Migrate(ctx))
	require.Empty(t, listMigrationBackupFiles(t, dataDirectory), "a current database restart must not create a backup")
}

func TestSQLiteBackupFailureStopsMigrationWithoutChangingSource(t *testing.T) {
	if getDriverFromEnv() != "sqlite" {
		t.Skip("SQLite migration backups do not apply to other drivers")
	}

	ctx := context.Background()
	dataDirectory, dsn, _ := createPendingSQLiteBackupFixture(ctx, t)
	blockedBackupPath := filepath.Join(dataDirectory, "backups")
	require.NoError(t, os.WriteFile(blockedBackupPath, []byte("not a directory"), 0o600))

	testingStore := openSQLiteBackupTestingStore(t, dataDirectory, dsn)
	defer testingStore.Close()

	err := testingStore.Migrate(ctx)
	require.Error(t, err)
	require.Contains(t, err.Error(), "pre-migration backup")

	sourceSetting, err := testingStore.GetInstanceBasicSetting(ctx)
	require.NoError(t, err)
	require.Equal(t, migrationBackupSourceVersion, sourceSetting.SchemaVersion)

	sourceDatabase := testingStore.GetDriver().GetDB()
	sourceHasTargetTable, err := tableExists(ctx, sourceDatabase, "sqlite", "user_identity")
	require.NoError(t, err)
	require.False(t, sourceHasTargetTable, "migration must not start when backup creation fails")
	requireSQLiteMemoContent(t, sourceDatabase, "pre-migration-sentinel", "preserve through migration")
}

func createPendingSQLiteBackupFixture(ctx context.Context, t *testing.T) (dataDirectory, dsn, targetVersion string) {
	t.Helper()

	dataDirectory = t.TempDir()
	dsn = filepath.Join(dataDirectory, "memos_prod.db")
	fixtureStore := openSQLiteBackupTestingStore(t, dataDirectory, dsn)
	defer fixtureStore.Close()

	require.NoError(t, fixtureStore.Migrate(ctx))
	var err error
	targetVersion, err = fixtureStore.GetCurrentSchemaVersion()
	require.NoError(t, err)
	require.Equal(t, "0.28.1", targetVersion, "update the fixture when adding a newer SQLite migration")

	user, err := createTestingHostUser(ctx, fixtureStore)
	require.NoError(t, err)
	_, err = fixtureStore.CreateMemo(ctx, &store.Memo{
		UID:        "pre-migration-sentinel",
		CreatorID:  user.ID,
		Content:    "preserve through migration",
		Visibility: store.Public,
	})
	require.NoError(t, err)

	basicSetting, err := fixtureStore.GetInstanceBasicSetting(ctx)
	require.NoError(t, err)
	basicSetting.SchemaVersion = migrationBackupSourceVersion
	_, err = fixtureStore.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{
		Key: storepb.InstanceSettingKey_BASIC,
		Value: &storepb.InstanceSetting_BasicSetting{
			BasicSetting: basicSetting,
		},
	})
	require.NoError(t, err)

	_, err = fixtureStore.GetDriver().GetDB().ExecContext(ctx, "DROP TABLE user_identity")
	require.NoError(t, err)
	return dataDirectory, dsn, targetVersion
}

func openSQLiteBackupTestingStore(t *testing.T, dataDirectory, dsn string) *store.Store {
	t.Helper()

	testingProfile := &profile.Profile{
		Data:    dataDirectory,
		DSN:     dsn,
		Driver:  "sqlite",
		Version: version.GetCurrentVersion(),
	}
	databaseDriver, err := db.NewDBDriver(testingProfile)
	require.NoError(t, err)
	return store.New(databaseDriver, testingProfile)
}

func listMigrationBackupFiles(t *testing.T, dataDirectory string) []string {
	t.Helper()

	backupDirectory := filepath.Join(dataDirectory, "backups")
	entries, err := os.ReadDir(backupDirectory)
	if os.IsNotExist(err) {
		return nil
	}
	require.NoError(t, err)

	paths := []string{}
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".db") {
			paths = append(paths, filepath.Join(backupDirectory, entry.Name()))
		}
	}
	return paths
}

func requireSQLiteIntegrityOK(t *testing.T, databasePath string) {
	t.Helper()

	database, err := sql.Open("sqlite", databasePath)
	require.NoError(t, err)
	defer database.Close()

	var result string
	require.NoError(t, database.QueryRow("PRAGMA integrity_check").Scan(&result))
	require.Equal(t, "ok", result)
}

func readSQLiteSchemaVersion(t *testing.T, database *sql.DB) string {
	t.Helper()

	var rawValue string
	require.NoError(t, database.QueryRow("SELECT value FROM system_setting WHERE name = 'BASIC'").Scan(&rawValue))
	setting := struct {
		SchemaVersion string `json:"schemaVersion"`
	}{}
	require.NoError(t, json.Unmarshal([]byte(rawValue), &setting))
	return setting.SchemaVersion
}

func requireSQLiteMemoContent(t *testing.T, database *sql.DB, uid, expectedContent string) {
	t.Helper()

	var content string
	require.NoError(t, database.QueryRow("SELECT content FROM memo WHERE uid = ?", uid).Scan(&content))
	require.Equal(t, expectedContent, content)
}
