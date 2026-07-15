//go:build windows

package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"

	"github.com/usememos/memos/internal/profile"
	"github.com/usememos/memos/internal/version"
	"github.com/usememos/memos/server"
	"github.com/usememos/memos/store"
	"github.com/usememos/memos/store/db"
)

const (
	appMutexName      = `Local\MemoArkDesktop`
	shutdownEventName = `Local\MemoArkDesktopShutdown`
	defaultPort       = 5230
)

var (
	user32          = windows.NewLazySystemDLL("user32.dll")
	messageBoxWProc = user32.NewProc("MessageBoxW")
)

func main() {
	shutdown := flag.Bool("shutdown", false, "shut down the running MemoArk desktop process")
	noBrowser := flag.Bool("no-browser", false, "do not open the browser after startup")
	dataDirectory := flag.String("data", "", "directory for the local database and attachments")
	port := flag.Int("port", defaultPort, "loopback port for the local MemoArk server")
	flag.Parse()

	if *shutdown {
		if err := signalShutdown(); err != nil && !errors.Is(err, windows.ERROR_FILE_NOT_FOUND) {
			showError("MemoArk could not be stopped cleanly.", err)
		}
		return
	}

	if *port < 1 || *port > 65535 {
		showError("MemoArk could not start.", fmt.Errorf("invalid port %d", *port))
		return
	}

	baseURL := fmt.Sprintf("http://127.0.0.1:%d/", *port)
	mutexName, err := windows.UTF16PtrFromString(appMutexName)
	if err != nil {
		showError("MemoArk could not start.", err)
		return
	}
	mutex, mutexErr := windows.CreateMutex(nil, false, mutexName)
	if mutex != 0 {
		defer windows.CloseHandle(mutex)
	}
	if errors.Is(mutexErr, windows.ERROR_ALREADY_EXISTS) {
		if !*noBrowser && waitUntilReady(baseURL, 30*time.Second) {
			_ = openBrowser(baseURL)
		}
		return
	}
	if mutexErr != nil {
		showError("MemoArk could not start.", mutexErr)
		return
	}

	if *dataDirectory == "" {
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData == "" {
			showError("MemoArk could not start.", errors.New("LOCALAPPDATA is unavailable"))
			return
		}
		*dataDirectory = filepath.Join(localAppData, "MemoArk")
	}
	if err := os.MkdirAll(*dataDirectory, 0o770); err != nil {
		showError("MemoArk could not create its data folder.", err)
		return
	}

	logFile, err := os.OpenFile(filepath.Join(*dataDirectory, "memoark.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		showError("MemoArk could not open its log file.", err)
		return
	}
	defer logFile.Close()
	slog.SetDefault(slog.New(slog.NewTextHandler(io.MultiWriter(logFile), &slog.HandlerOptions{Level: slog.LevelInfo})))

	appProfile := &profile.Profile{
		Addr:        "127.0.0.1",
		Port:        *port,
		Data:        *dataDirectory,
		Driver:      "sqlite",
		InstanceURL: baseURL,
		Version:     version.GetCurrentVersion(),
		Commit:      version.Commit,
	}
	if err := appProfile.Validate(); err != nil {
		showError("MemoArk could not validate its local configuration.", err)
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	driver, err := db.NewDBDriver(appProfile)
	if err != nil {
		showError("MemoArk could not open its local database.", err)
		return
	}
	storeInstance := store.New(driver, appProfile)
	if err := storeInstance.Migrate(ctx); err != nil {
		_ = storeInstance.Close()
		showError("MemoArk could not upgrade its local database.", err)
		return
	}

	appServer, err := server.NewServer(ctx, appProfile, storeInstance)
	if err != nil {
		_ = storeInstance.Close()
		showError("MemoArk could not initialize its local service.", err)
		return
	}
	if err := appServer.Start(ctx); err != nil {
		_ = storeInstance.Close()
		showError("MemoArk could not start its local service.", err)
		return
	}

	eventName, err := windows.UTF16PtrFromString(shutdownEventName)
	if err != nil {
		appServer.Shutdown(ctx)
		showError("MemoArk could not create its shutdown signal.", err)
		return
	}
	shutdownEvent, eventErr := windows.CreateEvent(nil, 1, 0, eventName)
	if shutdownEvent != 0 {
		defer windows.CloseHandle(shutdownEvent)
	}
	if eventErr != nil && !errors.Is(eventErr, windows.ERROR_ALREADY_EXISTS) {
		appServer.Shutdown(ctx)
		showError("MemoArk could not create its shutdown signal.", eventErr)
		return
	}

	if !*noBrowser {
		if waitUntilReady(baseURL, 15*time.Second) {
			_ = openBrowser(baseURL)
		} else {
			appServer.Shutdown(ctx)
			showError("MemoArk started but its local page did not become ready.", errors.New("startup timed out"))
			return
		}
	}

	if _, err := windows.WaitForSingleObject(shutdownEvent, windows.INFINITE); err != nil {
		slog.Error("failed to wait for shutdown signal", "error", err)
	}
	appServer.Shutdown(ctx)
}

func signalShutdown() error {
	eventName, err := windows.UTF16PtrFromString(shutdownEventName)
	if err != nil {
		return err
	}
	event, err := windows.OpenEvent(windows.EVENT_MODIFY_STATE, false, eventName)
	if err != nil {
		return err
	}
	defer windows.CloseHandle(event)
	return windows.SetEvent(event)
}

func waitUntilReady(baseURL string, timeout time.Duration) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		response, err := client.Get(baseURL + "healthz")
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode == http.StatusOK {
				return true
			}
		}
		time.Sleep(250 * time.Millisecond)
	}
	return false
}

func openBrowser(url string) error {
	command := exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", url)
	command.SysProcAttr = &windows.SysProcAttr{HideWindow: true}
	return command.Start()
}

func showError(message string, err error) {
	text, textErr := windows.UTF16PtrFromString(message + "\n\n" + err.Error() + "\n\nLog: %LOCALAPPDATA%\\MemoArk\\memoark.log")
	if textErr != nil {
		return
	}
	title, titleErr := windows.UTF16PtrFromString("MemoArk")
	if titleErr != nil {
		return
	}
	messageBoxWProc.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), 0x10)
}
