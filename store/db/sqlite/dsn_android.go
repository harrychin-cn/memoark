//go:build android

package sqlite

func sqliteDSN(dsn string) string {
	return appendSQLiteDSNQuery(dsn, "_foreign_keys=off&_busy_timeout=10000&_journal_mode=WAL")
}
