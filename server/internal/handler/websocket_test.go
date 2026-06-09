package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"sparklab/server/internal/config"
)

func TestWebSocketOriginPolicyAllowsConfiguredOrigins(t *testing.T) {
	h := &Handler{cfg: &config.Config{WebURL: "https://lab.example.com, http://localhost:3000"}}

	req := httptest.NewRequest(http.MethodGet, "http://backend.local/containers/c/terminal", nil)
	req.Header.Set("Origin", "https://lab.example.com")
	if !h.isAllowedWebSocketOrigin(req) {
		t.Fatal("expected configured production origin to be allowed")
	}

	req.Header.Set("Origin", "http://localhost:3000")
	if !h.isAllowedWebSocketOrigin(req) {
		t.Fatal("expected configured local origin to be allowed")
	}

	req.Header.Set("Origin", "http://127.0.0.1:3000")
	if !h.isAllowedWebSocketOrigin(req) {
		t.Fatal("expected configured local loopback alias to be allowed")
	}
}

func TestWebSocketOriginPolicyAllowsSameOriginProxyHost(t *testing.T) {
	h := &Handler{cfg: &config.Config{WebURL: "https://lab.example.com"}}

	req := httptest.NewRequest(http.MethodGet, "http://sparklab.internal/monitor/resources/stream", nil)
	req.Host = "training.example.com"
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("Origin", "https://training.example.com")

	if !h.isAllowedWebSocketOrigin(req) {
		t.Fatal("expected same proxy host origin to be allowed")
	}
}

func TestWebSocketOriginPolicyRejectsMissingMalformedAndForeignOrigins(t *testing.T) {
	h := &Handler{cfg: &config.Config{WebURL: "https://lab.example.com"}}

	cases := []struct {
		name   string
		origin string
	}{
		{name: "missing"},
		{name: "malformed", origin: "://bad-origin"},
		{name: "foreign", origin: "https://evil.example.com"},
		{name: "scheme mismatch", origin: "http://lab.example.com"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "http://backend.local/containers/c/terminal", nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			if h.isAllowedWebSocketOrigin(req) {
				t.Fatalf("expected origin %q to be rejected", tc.origin)
			}
		})
	}
}
