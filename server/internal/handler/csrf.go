package handler

import (
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RequireSameOriginForUnsafeMethods() gin.HandlerFunc {
	return func(c *gin.Context) {
		if csrfSafeMethod(c.Request.Method) {
			c.Next()
			return
		}
		if csrfBearerOnlyRequest(c.Request) {
			c.Next()
			return
		}
		if csrfPublicAuthRequest(c.Request) {
			c.Next()
			return
		}
		if h.isAllowedRequestOrigin(c.Request) {
			c.Next()
			return
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"message": "Cross-site request blocked"})
	}
}

func csrfSafeMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodTrace:
		return true
	default:
		return false
	}
}

func csrfBearerOnlyRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	if hasAccessTokenCookie(r) {
		return false
	}
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	return strings.HasPrefix(strings.ToLower(auth), "bearer ")
}

func csrfPublicAuthRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	path := strings.TrimRight(r.URL.Path, "/")
	switch {
	case strings.HasSuffix(path, "/auth/login"), strings.HasSuffix(path, "/auth/register"):
		return true
	default:
		return false
	}
}

func hasAccessTokenCookie(r *http.Request) bool {
	if r == nil {
		return false
	}
	for _, cookie := range r.Cookies() {
		if cookie.Name == "access_token" && strings.TrimSpace(cookie.Value) != "" {
			return true
		}
	}
	return false
}

func (h *Handler) isAllowedRequestOrigin(r *http.Request) bool {
	raw := strings.TrimSpace(r.Header.Get("Origin"))
	if raw == "" {
		raw = strings.TrimSpace(r.Header.Get("Referer"))
	}
	if h.isAllowedOriginValue(r, raw) {
		return true
	}

	proxyOrigin := strings.TrimSpace(r.Header.Get("X-SparkLab-Proxy-Origin"))
	return requestFromTrustedProxyNetwork(r) && h.isAllowedOriginValue(r, proxyOrigin)
}

func (h *Handler) isAllowedOriginValue(r *http.Request, raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return false
	}
	originKey := websocketOriginKey(u.Scheme, u.Host)
	for _, allowed := range h.allowedWebSocketOrigins(r) {
		if originKey == allowed {
			return true
		}
	}
	return false
}

func requestFromTrustedProxyNetwork(r *http.Request) bool {
	if r == nil {
		return false
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(strings.Trim(host, "[]"))
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate())
}
