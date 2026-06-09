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

func TestSameOriginGuardAllowsSafeMethods(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &Handler{cfg: &config.Config{WebURL: "https://lab.example.com"}}

	w := performCSRFGuardRequest(h, http.MethodGet, "https://evil.example", "", "access_token=session", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected safe method 200, got %d body=%s", w.Code, w.Body.String())
	}
}

func performCSRFGuardRequest(h *Handler, method, origin, referer, cookie, authorization string) *httptest.ResponseRecorder {
	r := gin.New()
	r.Use(h.RequireSameOriginForUnsafeMethods())
	r.Handle(method, "/guarded", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, "/guarded", nil)
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
