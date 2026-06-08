package handler

import (
	"context"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"sparklab/server/internal/config"

	"github.com/docker/docker/client"
	"gorm.io/gorm"
)

// Handler 依赖共享的 Docker HTTP 客户端访问本机 Docker Engine。
type Handler struct {
	db  *gorm.DB
	cfg *config.Config

	// dockerHTTP 带总超时，用于 Docker Engine REST（创建容器、镜像列表等）
	dockerHTTP *http.Client
	// dockerAPIBaseURL 是 Docker Engine HTTP API 的请求基址。Unix socket 使用 http://docker 作为哑主机。
	dockerAPIBaseURL string
}

func New(db *gorm.DB, cfg *config.Config) *Handler {
	api, baseURL := newPooledDockerHTTPClient(cfg.DockerHost)
	return &Handler{
		db:               db,
		cfg:              cfg,
		dockerHTTP:       api,
		dockerAPIBaseURL: baseURL,
	}
}

func newPooledDockerHTTPClient(dockerHost string) (api *http.Client, baseURL string) {
	t := &http.Transport{
		MaxIdleConns:          256,
		MaxIdleConnsPerHost:   128,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		DisableCompression:    true,
		ForceAttemptHTTP2:     false,
	}

	host := strings.TrimSpace(dockerHost)
	if host == "" {
		host = "unix:///var/run/docker.sock"
	}
	if strings.HasPrefix(host, "/") {
		host = "unix://" + host
	}
	if !strings.HasPrefix(host, "unix://") {
		host = "unix:///var/run/docker.sock"
	}

	socketPath := strings.TrimPrefix(host, "unix://")
	t.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
		var d net.Dialer
		return d.DialContext(ctx, "unix", socketPath)
	}
	baseURL = "http://docker"

	timeout := dockerAPIHTTPTimeout()
	return &http.Client{Transport: t, Timeout: timeout}, baseURL
}

func (h *Handler) newDockerClient() (*client.Client, error) {
	return client.NewClientWithOpts(
		client.WithHost(h.cfg.DockerHost),
		client.WithAPIVersionNegotiation(),
	)
}

// dockerAPIHTTPTimeout 可通过环境变量 DOCKER_API_HTTP_TIMEOUT_SEC 调整（拉取大镜像时需更大）。
func dockerAPIHTTPTimeout() time.Duration {
	if s := os.Getenv("DOCKER_API_HTTP_TIMEOUT_SEC"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			return time.Duration(n) * time.Second
		}
	}
	return 180 * time.Second
}
