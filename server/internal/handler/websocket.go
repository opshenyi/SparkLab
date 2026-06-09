package handler

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func (h *Handler) upgradeWebSocket(c *gin.Context) (*websocket.Conn, error) {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  8192,
		WriteBufferSize: 8192,
		CheckOrigin: func(r *http.Request) bool {
			return h.isAllowedWebSocketOrigin(r)
		},
	}
	return upgrader.Upgrade(c.Writer, c.Request, nil)
}

func (h *Handler) isAllowedWebSocketOrigin(r *http.Request) bool {
	rawOrigin := strings.TrimSpace(r.Header.Get("Origin"))
	if rawOrigin == "" {
		return false
	}

	origin, err := url.Parse(rawOrigin)
	if err != nil || origin.Scheme == "" || origin.Host == "" {
		return false
	}

	originKey := websocketOriginKey(origin.Scheme, origin.Host)
	for _, allowed := range h.allowedWebSocketOrigins(r) {
		if originKey == allowed {
			return true
		}
	}
	return false
}

func (h *Handler) allowedWebSocketOrigins(r *http.Request) []string {
	seen := map[string]struct{}{}
	add := func(raw string) {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			return
		}
		u, err := url.Parse(raw)
		if err != nil || u.Scheme == "" || u.Host == "" {
			return
		}
		seen[websocketOriginKey(u.Scheme, u.Host)] = struct{}{}
		if websocketIsLoopbackHost(u.Hostname()) {
			port := u.Port()
			seen[websocketOriginKey(u.Scheme, websocketHostWithPort("localhost", port))] = struct{}{}
			seen[websocketOriginKey(u.Scheme, websocketHostWithPort("127.0.0.1", port))] = struct{}{}
			seen[websocketOriginKey(u.Scheme, websocketHostWithPort("::1", port))] = struct{}{}
		}
	}

	if h != nil && h.cfg != nil {
		for _, raw := range strings.Split(h.cfg.WebURL, ",") {
			add(raw)
		}
	}
	if len(seen) == 0 {
		add("http://localhost:3000")
	}

	if r != nil && strings.TrimSpace(r.Host) != "" {
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		add(scheme + "://" + r.Host)

		for _, forwarded := range strings.Split(r.Header.Get("X-Forwarded-Proto"), ",") {
			forwarded = strings.ToLower(strings.TrimSpace(forwarded))
			if forwarded == "http" || forwarded == "https" {
				add(forwarded + "://" + r.Host)
			}
		}
	}

	origins := make([]string, 0, len(seen))
	for origin := range seen {
		origins = append(origins, origin)
	}
	return origins
}

func websocketOriginKey(scheme, host string) string {
	return strings.ToLower(strings.TrimSpace(scheme)) + "://" + strings.ToLower(strings.TrimSpace(host))
}

func websocketIsLoopbackHost(host string) bool {
	host = strings.ToLower(strings.Trim(strings.TrimSpace(host), "[]"))
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func websocketHostWithPort(host, port string) string {
	if port == "" {
		if strings.Contains(host, ":") && !strings.HasPrefix(host, "[") {
			return "[" + host + "]"
		}
		return host
	}
	if strings.Contains(host, ":") && !strings.HasPrefix(host, "[") {
		return "[" + host + "]:" + port
	}
	return host + ":" + port
}
