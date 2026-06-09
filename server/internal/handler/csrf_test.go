package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"sparklab/server/internal/config"

	"github.com/gin-gonic/gin"
)

func TestSameOriginGuardAllowsConfiguredOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &Handler{cfg: &config.Config{WebURL: "https://lab.example.com"}}

	w := performCSRFGuardRequest(h, http.MethodPost, "https://lab.example.com", "", "access_token=session", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected allowed origin 200, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestSameOriginGuardRejectsForeignAndMissingCookieOrigins(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &Handler{cfg: &config.Config{WebURL: "https://lab.example.com"}}

	w := performCSRFGuardRequest(h, http.MethodPost, "https://evil.example", "", "access_token=session", "")
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected foreign origin 403, got %d body=%s", w.Code, w.Body.String())
	}

	w = performCSRFGuardRequest(h, http.MethodPost, "", "", "access_token=session", "")
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected missing cookie origin 403, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestSameOriginGuardAllowsRefererAndBearerOnlyAPI(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &Handler{cfg: &config.Config{WebURL: "https://lab.example.com"}}

	w := performCSRFGuardRequest(h, http.MethodPatch, "", "https://lab.example.com/admin", "access_token=session", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected same-site referer 200, got %d body=%s", w.Code, w.Body.String())
	}

	w = performCSRFGuardRequest(h, http.MethodDelete, "", "", "", "Bearer api-token")
	if w.Code != http.StatusOK {
		t.Fatalf("expected bearer-only API 200, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestSameOriginGuardAllowsTrustedProxyOriginHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &Handler{cfg: &config.Config{WebURL: "https://lab.example.com"}}

	w := performCSRFGuardProxyRequest(h, "https://lab.example.com", "127.0.0.1:12345")
	if w.Code != http.StatusOK {
		t.Fatalf("expected loopback proxy origin 200, got %d body=%s", w.Code, w.Body.String())
	}

	w = performCSRFGuardProxyRequest(h, "https://evil.example", "127.0.0.1:12345")
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected foreign proxy origin 403, got %d body=%s", w.Code, w.Body.String())
	}

	w = performCSRFGuardProxyRequest(h, "https://lab.example.com", "203.0.113.10:12345")
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected untrusted proxy network 403, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestSameOriginGuardAllowsPublicAuthWithoutSession(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &Handler{cfg: &config.Config{WebURL: "https://lab.example.com"}}

	w := performCSRFGuardPathRequest(h, http.MethodPost, "/auth/login", "", "", "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected public login without session 200, got %d body=%s", w.Code, w.Body.String())
	}

	w = performCSRFGuardPathRequest(h, http.MethodPost, "/auth/register", "", "", "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected public register without session 200, got %d body=%s", w.Code, w.Body.String())
	}

	w = performCSRFGuardPathRequest(h, http.MethodPost, "/auth/login", "", "", "access_token=session", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected public login endpoint to stay public with session cookie, got %d body=%s", w.Code, w.Body.String())
	}

	w = performCSRFGuardPathRequest(h, http.MethodPost, "/guarded", "", "", "access_token=session", "")
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected guarded write with session cookie and no origin 403, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestSameOriginGuardAllowsSafeMethods(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &Handler{cfg: &config.Config{WebURL: "https://lab.example.com"}}

	w := performCSRFGuardRequest(h, http.MethodGet, "https://evil.example", "", "access_token=session", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected safe method 200, got %d body=%s", w.Code, w.Body.String())
	}
}

func performCSRFGuardRequest(h *Handler, method, origin, referer, cookie, authorization string) *httptest.ResponseRecorder {
	return performCSRFGuardPathRequest(h, method, "/guarded", origin, referer, cookie, authorization)
}

func performCSRFGuardPathRequest(h *Handler, method, path, origin, referer, cookie, authorization string) *httptest.ResponseRecorder {
	r := gin.New()
	r.Use(h.RequireSameOriginForUnsafeMethods())
	r.Handle(method, path, func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, nil)
	req.Host = "lab.example.com"
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	if referer != "" {
		req.Header.Set("Referer", referer)
	}
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	if authorization != "" {
		req.Header.Set("Authorization", authorization)
	}
	r.ServeHTTP(w, req)
	return w
}

func performCSRFGuardProxyRequest(h *Handler, proxyOrigin, remoteAddr string) *httptest.ResponseRecorder {
	r := gin.New()
	r.Use(h.RequireSameOriginForUnsafeMethods())
	r.Handle(http.MethodPost, "/guarded", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/guarded", nil)
	req.Host = "lab.example.com"
	req.RemoteAddr = remoteAddr
	req.Header.Set("Cookie", "access_token=session")
	req.Header.Set("X-SparkLab-Proxy-Origin", proxyOrigin)
	r.ServeHTTP(w, req)
	return w
}
