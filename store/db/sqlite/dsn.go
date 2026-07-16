package sqlite

import "strings"

func appendSQLiteDSNQuery(dsn, query string) string {
	separator := "?"
	if strings.Contains(dsn, "?") {
		separator = "&"
	}
	return dsn + separator + query
}
