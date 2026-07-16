package backend

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStartStopAndPersistence(t *testing.T) {
	port := unusedPort(t)
	dataDirectory := t.TempDir()

	if message := Start(dataDirectory, port); message != "" {
		t.Fatalf("Start() returned %q", message)
	}
	t.Cleanup(func() { Stop() })

	expectedURL := fmt.Sprintf("http://127.0.0.1:%d/", port)
	if got := URL(); got != expectedURL {
		t.Fatalf("URL() = %q, want %q", got, expectedURL)
	}
	waitForHealth(t, expectedURL+"healthz")

	databasePath := filepath.Join(dataDirectory, "memos_prod.db")
	if info, err := os.Stat(databasePath); err != nil || info.Size() == 0 {
		t.Fatalf("database was not persisted at %s: info=%v err=%v", databasePath, info, err)
	}

	if message := Stop(); message != "" {
		t.Fatalf("Stop() returned %q", message)
	}
	if got := URL(); got != "" {
		t.Fatalf("URL() after stop = %q, want empty", got)
	}

	if message := Start(dataDirectory, port); message != "" {
		t.Fatalf("second Start() returned %q", message)
	}
	waitForHealth(t, expectedURL+"healthz")
}

func unusedPort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port
}

func waitForHealth(t *testing.T, url string) {
	t.Helper()
	client := &http.Client{Timeout: time.Second}
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		response, err := client.Get(url)
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode == http.StatusOK {
				return
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("health endpoint %s did not become ready", url)
}
