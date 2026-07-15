//go:build !android

package sqlite

func sqliteDSN(dsn string) string {
	return appendSQLiteDSNQuery(dsn, "_pragma=foreign_keys(0)&_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)&_pragma=mmap_size(0)")
}
