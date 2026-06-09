package handler

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"sparklab/server/internal/model"
)

func envBool(key string, fallback bool) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func envFloat(key string, fallback float64) float64 {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return fallback
	}
	return n
}

func envString(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	return v
}

func normalizedLabCPU(raw float64) float64 {
	minCPU := envFloat("LAB_CONTAINER_MIN_CPU", 0.1)
	defaultCPU := envFloat("LAB_CONTAINER_DEFAULT_CPU", 1.0)
	maxCPU := envFloat("LAB_CONTAINER_MAX_CPU", 2.0)
	if minCPU <= 0 {
		minCPU = 0.1
	}
	if defaultCPU < minCPU {
		defaultCPU = minCPU
	}
	if maxCPU < minCPU {
		maxCPU = minCPU
	}
	cpu := raw
	if cpu <= 0 {
		cpu = defaultCPU
	}
	if cpu < minCPU {
		return minCPU
	}
	if cpu > maxCPU {
		return maxCPU
	}
	return cpu
}

func normalizedLabMemoryMB(raw int) int {
	minMB := envInt("LAB_CONTAINER_MIN_MEMORY_MB", 128)
	defaultMB := envInt("LAB_CONTAINER_DEFAULT_MEMORY_MB", 512)
	maxMB := envInt("LAB_CONTAINER_MAX_MEMORY_MB", 2048)
	if minMB <= 0 {
		minMB = 128
	}
	if defaultMB < minMB {
		defaultMB = minMB
	}
	if maxMB < minMB {
		maxMB = minMB
	}
	memory := raw
	if memory <= 0 {
		memory = defaultMB
	}
	if memory < minMB {
		return minMB
	}
	if memory > maxMB {
		return maxMB
	}
	return memory
}

func labContainerPidsLimit() int64 {
	n := envInt("LAB_CONTAINER_PIDS_LIMIT", 256)
	if n <= 0 {
		n = 256
	}
	return int64(n)
}

func labContainerNetworkMode() string {
	mode := strings.ToLower(envString("LAB_CONTAINER_NETWORK_MODE", "bridge"))
	switch mode {
	case "none", "bridge":
		return mode
	default:
		return "bridge"
	}
}

func labRestartPolicy(raw string) string {
	if !envBool("LAB_CONTAINER_ALLOW_RESTART_POLICY", false) {
		return "no"
	}
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "no", "on-failure", "unless-stopped":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return "no"
	}
}

func buildLabHostConfig(lab *model.Lab) map[string]any {
	cpu := normalizedLabCPU(lab.CPULimit)
	memoryMB := normalizedLabMemoryMB(lab.MemoryLimit)
	hostConfig := map[string]any{
		"Memory":         int64(memoryMB) * 1024 * 1024,
		"NanoCpus":       int64(cpu * 1e9),
		"PidsLimit":      labContainerPidsLimit(),
		"Privileged":     false,
		"NetworkMode":    labContainerNetworkMode(),
		"AutoRemove":     false,
		"ReadonlyRootfs": envBool("LAB_CONTAINER_READONLY_ROOTFS", false),
		"SecurityOpt":    []string{"no-new-privileges:true"},
		"CapDrop":        []string{"ALL"},
		"RestartPolicy": map[string]any{
			"Name": labRestartPolicy(lab.RestartPolicy),
		},
	}
	if capAdd := splitCSVEnv("LAB_CONTAINER_CAP_ADD"); len(capAdd) > 0 {
		hostConfig["CapAdd"] = capAdd
	}
	return hostConfig
}

func splitCSVEnv(key string) []string {
	raw := os.Getenv(key)
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func labStaticHostPortsAllowed() bool {
	return envBool("LAB_CONTAINER_ALLOW_STATIC_HOST_PORTS", false)
}

func labHostBindIP() string {
	return envString("LAB_CONTAINER_HOST_BIND_IP", "0.0.0.0")
}

func parseHostPort(raw any) (int, bool) {
	switch v := raw.(type) {
	case float64:
		return int(v), v > 0
	case int:
		return v, v > 0
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(v))
		return n, err == nil && n > 0
	default:
		return 0, false
	}
}

func labContainerPortSpec(pm map[string]any) (string, bool) {
	port, ok := parseHostPort(pm["containerPort"])
	if !ok || port > 65535 {
		return "", false
	}
	protocol := strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", pm["protocol"])))
	if protocol == "" || protocol == "<nil>" {
		protocol = "tcp"
	}
	if protocol != "tcp" && protocol != "udp" {
		return "", false
	}
	return fmt.Sprintf("%d/%s", port, protocol), true
}

func hostPortInLabRange(port int) bool {
	minPort := envInt("LAB_CONTAINER_HOST_PORT_MIN", 30000)
	maxPort := envInt("LAB_CONTAINER_HOST_PORT_MAX", 49999)
	if minPort <= 0 || maxPort < minPort {
		minPort = 30000
		maxPort = 49999
	}
	return port >= minPort && port <= maxPort
}

func labHostBindAllowed(hostPath string) bool {
	if !envBool("LAB_CONTAINER_ALLOW_HOST_BINDS", false) {
		return false
	}
	root := strings.TrimSpace(os.Getenv("LAB_CONTAINER_HOST_BIND_ROOT"))
	if root == "" {
		return false
	}
	hostPath = strings.TrimSpace(hostPath)
	if hostPath == "" {
		return false
	}
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return false
	}
	hostAbs, err := filepath.Abs(hostPath)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(rootAbs, hostAbs)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	if rel == ".." || strings.HasPrefix(rel, fmt.Sprintf("..%c", filepath.Separator)) {
		return false
	}
	return true
}
