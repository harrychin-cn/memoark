package email

import (
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"golang.org/x/sync/errgroup"
)

func TestSend(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to start local SMTP test listener: %v", err)
	}
	t.Cleanup(func() {
		_ = listener.Close()
	})

	serverDone := make(chan error, 1)
	go func() {
		conn, err := listener.Accept()
		if err == nil {
			err = conn.Close()
		}
		serverDone <- err
	}()

	config := &Config{
		SMTPHost:  "127.0.0.1",
		SMTPPort:  listener.Addr().(*net.TCPAddr).Port,
		FromEmail: "test@example.com",
	}

	message := &Message{
		To:      []string{"recipient@example.com"},
		Subject: "Test",
		Body:    "Test body",
	}

	// The local listener accepts TCP and closes before an SMTP greeting. This
	// verifies that valid inputs reach the SMTP protocol layer without relying
	// on external DNS or platform-specific socket error text.
	err = Send(config, message)
	assert.NoError(t, <-serverDone)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to create SMTP client")
	assert.NotContains(t, err.Error(), "invalid email")
}

func TestSendValidation(t *testing.T) {
	tests := []struct {
		name    string
		config  *Config
		message *Message
		wantErr bool
		errMsg  string
	}{
		{
			name:    "nil config",
			config:  nil,
			message: &Message{To: []string{"test@example.com"}, Subject: "Test", Body: "Test"},
			wantErr: true,
			errMsg:  "configuration is required",
		},
		{
			name:    "nil message",
			config:  &Config{SMTPHost: "smtp.example.com", SMTPPort: 587, FromEmail: "from@example.com"},
			message: nil,
			wantErr: true,
			errMsg:  "message is required",
		},
		{
			name: "invalid config",
			config: &Config{
				SMTPHost: "",
				SMTPPort: 587,
			},
			message: &Message{To: []string{"test@example.com"}, Subject: "Test", Body: "Test"},
			wantErr: true,
			errMsg:  "invalid email configuration",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := Send(tt.config, tt.message)
			if tt.wantErr {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.errMsg)
			}
		})
	}
}

func TestSendAsync(t *testing.T) {
	config := &Config{
		SMTPHost:  "smtp.example.com",
		SMTPPort:  587,
		FromEmail: "test@example.com",
	}

	message := &Message{
		To:      []string{"recipient@example.com"},
		Subject: "Test Async",
		Body:    "Test async body",
	}

	// SendAsync should not block
	start := time.Now()
	SendAsync(config, message)
	duration := time.Since(start)

	// Should return almost immediately (< 100ms)
	assert.Less(t, duration, 100*time.Millisecond)

	// Give goroutine time to start
	time.Sleep(50 * time.Millisecond)
}

func TestSendAsyncConcurrent(t *testing.T) {
	config := &Config{
		SMTPHost:  "smtp.example.com",
		SMTPPort:  587,
		FromEmail: "test@example.com",
	}

	g := errgroup.Group{}
	count := 5

	for i := 0; i < count; i++ {
		g.Go(func() error {
			message := &Message{
				To:      []string{"recipient@example.com"},
				Subject: "Concurrent Test",
				Body:    "Test body",
			}
			SendAsync(config, message)
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		t.Fatalf("SendAsync calls failed: %v", err)
	}
}
