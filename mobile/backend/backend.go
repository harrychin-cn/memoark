// Package backend exposes the embedded MemoArk service to native mobile hosts.
package backend

import (
	"context"
	"fmt"
	"sync"

	"github.com/usememos/memos/internal/profile"
	"github.com/usememos/memos/internal/version"
	"github.com/usememos/memos/server"
	"github.com/usememos/memos/store"
	"github.com/usememos/memos/store/db"
)

const defaultPort = 5230

var runtimeState struct {
	sync.Mutex
	server *server.Server
	cancel context.CancelFunc
	url    string
}

// Start starts the loopback-only MemoArk service and returns an empty string on success.
// A non-empty return value is an error message suitable for showing in the native UI.
func Start(dataDirectory string, port int) string {
	runtimeState.Lock()
	defer runtimeState.Unlock()

	if runtimeState.server != nil {
		return ""
	}
	if port == 0 {
		port = defaultPort
	}
	if port < 1 || port > 65535 {
		return fmt.Sprintf("invalid port %d", port)
	}

	baseURL := fmt.Sprintf("http://127.0.0.1:%d/", port)
	appProfile := &profile.Profile{
		Addr:        "127.0.0.1",
		Port:        port,
		Data:        dataDirectory,
		Driver:      "sqlite",
		InstanceURL: baseURL,
		Version:     version.GetCurrentVersion(),
		Commit:      version.Commit,
	}
	if err := appProfile.Validate(); err != nil {
		return fmt.Sprintf("validate local configuration: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	driver, err := db.NewDBDriver(appProfile)
	if err != nil {
		cancel()
		return fmt.Sprintf("open local database: %v", err)
	}
	storeInstance := store.New(driver, appProfile)
	if err := storeInstance.Migrate(ctx); err != nil {
		_ = storeInstance.Close()
		cancel()
		return fmt.Sprintf("upgrade local database: %v", err)
	}

	appServer, err := server.NewServer(ctx, appProfile, storeInstance)
	if err != nil {
		_ = storeInstance.Close()
		cancel()
		return fmt.Sprintf("initialize local service: %v", err)
	}
	if err := appServer.Start(ctx); err != nil {
		_ = storeInstance.Close()
		cancel()
		return fmt.Sprintf("start local service: %v", err)
	}

	runtimeState.server = appServer
	runtimeState.cancel = cancel
	runtimeState.url = baseURL
	return ""
}

// Stop shuts down the local HTTP service and closes SQLite safely.
// It is idempotent and returns an empty string after a successful shutdown.
func Stop() string {
	runtimeState.Lock()
	defer runtimeState.Unlock()

	if runtimeState.server == nil {
		return ""
	}
	appServer := runtimeState.server
	cancel := runtimeState.cancel
	runtimeState.server = nil
	runtimeState.cancel = nil
	runtimeState.url = ""

	appServer.Shutdown(context.Background())
	if cancel != nil {
		cancel()
	}
	return ""
}

// URL returns the active loopback URL, or an empty string while stopped.
func URL() string {
	runtimeState.Lock()
	defer runtimeState.Unlock()
	return runtimeState.url
}
