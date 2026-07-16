//go:build android

package sqlite

import (
	"database/sql"
	"sync"

	"github.com/mattn/go-sqlite3"
	"golang.org/x/text/cases"
)

var (
	registerUnicodeLowerOnce sync.Once
	registerUnicodeLowerErr  error
	unicodeFold              = cases.Fold()
)

func ensureUnicodeLowerRegistered() error {
	registerUnicodeLowerOnce.Do(func() {
		sql.Register("sqlite", &sqlite3.SQLiteDriver{
			ConnectHook: func(connection *sqlite3.SQLiteConn) error {
				if err := connection.RegisterFunc("memos_unicode_lower", func(value string) string {
					return unicodeFold.String(value)
				}, true); err != nil {
					return err
				}
				_, err := connection.Exec("PRAGMA mmap_size=0", nil)
				return err
			},
		})
	})
	return registerUnicodeLowerErr
}
