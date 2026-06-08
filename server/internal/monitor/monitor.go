package monitor

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
)

// ResourceStats represents system resource usage
type ResourceStats struct {
	CPUUsage    float64   `json:"cpuUsage"`
	MemoryUsage float64   `json:"memoryUsage"`
	MemoryTotal uint64    `json:"memoryTotal"`
	MemoryUsed  uint64    `json:"memoryUsed"`
	LoadAvg1    float64   `json:"loadAvg1"`
	LoadAvg5    float64   `json:"loadAvg5"`
	LoadAvg15   float64   `json:"loadAvg15"`
	CPUCores    int       `json:"cpuCores"`
	Timestamp   time.Time `json:"timestamp"`
}

// ContainerStats represents Docker container statistics
type ContainerStats struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Status      string  `json:"status"`
	CPUPercent  float64 `json:"cpuPercent"`
	MemoryUsage uint64  `json:"memoryUsage"`
	MemoryLimit uint64  `json:"memoryLimit"`
	NetworkRx   uint64  `json:"networkRx"`
	NetworkTx   uint64  `json:"networkTx"`
}

// Monitor handles resource monitoring
type Monitor struct {
	dockerClient *client.Client
	mu           sync.RWMutex
	lastStats    *ResourceStats
	subscribers  map[string]chan *ResourceStats
}

// New creates a new Monitor instance
func New() (*Monitor, error) {
	// Try to connect to Docker
	dockerClient, err := client.NewClientWithOpts(
		client.WithHost(localDockerHost()),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		// Docker not available, continue without it
		dockerClient = nil
	}

	return &Monitor{
		dockerClient: dockerClient,
		subscribers:  make(map[string]chan *ResourceStats),
	}, nil
}

func localDockerHost() string {
	host := strings.TrimSpace(os.Getenv("DOCKER_HOST"))
	if host == "" {
		return "unix:///var/run/docker.sock"
	}
	if strings.HasPrefix(host, "unix://") {
		return host
	}
	if strings.HasPrefix(host, "/") {
		return "unix://" + host
	}
	return "unix:///var/run/docker.sock"
}

// GetResourceStats retrieves current system resource statistics
func (m *Monitor) GetResourceStats(ctx context.Context) (*ResourceStats, error) {
	stats := &ResourceStats{
		Timestamp: time.Now(),
		CPUCores:  runtime.NumCPU(),
	}

	// Get CPU usage
	cpuPercent, err := cpu.PercentWithContext(ctx, time.Second, false)
	if err == nil && len(cpuPercent) > 0 {
		stats.CPUUsage = cpuPercent[0]
	}

	// Get memory stats
	memInfo, err := mem.VirtualMemoryWithContext(ctx)
	if err == nil {
		stats.MemoryTotal = memInfo.Total
		stats.MemoryUsed = memInfo.Used
		stats.MemoryUsage = memInfo.UsedPercent
	}

	// Get load average
	loadInfo, err := load.AvgWithContext(ctx)
	if err == nil {
		stats.LoadAvg1 = loadInfo.Load1
		stats.LoadAvg5 = loadInfo.Load5
		stats.LoadAvg15 = loadInfo.Load15
	}

	m.mu.Lock()
	m.lastStats = stats
	m.mu.Unlock()

	return stats, nil
}

// GetLastStats returns the last collected stats
func (m *Monitor) GetLastStats() *ResourceStats {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.lastStats
}

// StartMonitoring begins continuous resource monitoring
func (m *Monitor) StartMonitoring(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			stats, err := m.GetResourceStats(ctx)
			if err != nil {
				continue
			}

			// Broadcast to all subscribers
			m.mu.RLock()
			for _, ch := range m.subscribers {
				select {
				case ch <- stats:
				default:
					// Skip if channel is full
				}
			}
			m.mu.RUnlock()
		}
	}
}

// Subscribe adds a subscriber for resource updates
func (m *Monitor) Subscribe(id string) chan *ResourceStats {
	m.mu.Lock()
	defer m.mu.Unlock()

	ch := make(chan *ResourceStats, 10)
	m.subscribers[id] = ch
	return ch
}

// Unsubscribe removes a subscriber
func (m *Monitor) Unsubscribe(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if ch, ok := m.subscribers[id]; ok {
		close(ch)
		delete(m.subscribers, id)
	}
}

// GetDockerContainers retrieves list of Docker containers
func (m *Monitor) GetDockerContainers(ctx context.Context) ([]types.Container, error) {
	if m.dockerClient == nil {
		return nil, fmt.Errorf("docker client not available")
	}

	containers, err := m.dockerClient.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, err
	}

	return containers, nil
}

// GetContainerStats retrieves statistics for a specific container
func (m *Monitor) GetContainerStats(ctx context.Context, containerID string) (*ContainerStats, error) {
	if m.dockerClient == nil {
		return nil, fmt.Errorf("docker client not available")
	}

	stats, err := m.dockerClient.ContainerStats(ctx, containerID, false)
	if err != nil {
		return nil, err
	}
	defer stats.Body.Close()

	var v map[string]interface{}
	if err := json.NewDecoder(stats.Body).Decode(&v); err != nil {
		return nil, err
	}

	// Calculate CPU percentage
	cpuPercent := 0.0
	if cpuStats, ok := v["cpu_stats"].(map[string]interface{}); ok {
		if preCPUStats, ok := v["precpu_stats"].(map[string]interface{}); ok {
			if cpuUsage, ok := cpuStats["cpu_usage"].(map[string]interface{}); ok {
				if preCPUUsage, ok := preCPUStats["cpu_usage"].(map[string]interface{}); ok {
					if totalUsage, ok := cpuUsage["total_usage"].(float64); ok {
						if preTotalUsage, ok := preCPUUsage["total_usage"].(float64); ok {
							if systemUsage, ok := cpuStats["system_cpu_usage"].(float64); ok {
								if preSystemUsage, ok := preCPUStats["system_cpu_usage"].(float64); ok {
									cpuDelta := totalUsage - preTotalUsage
									systemDelta := systemUsage - preSystemUsage
									if systemDelta > 0 && cpuDelta > 0 {
										if percpuUsage, ok := cpuUsage["percpu_usage"].([]interface{}); ok {
											cpuPercent = (cpuDelta / systemDelta) * float64(len(percpuUsage)) * 100.0
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}

	// Get memory stats
	var memoryUsage, memoryLimit uint64
	if memStats, ok := v["memory_stats"].(map[string]interface{}); ok {
		if usage, ok := memStats["usage"].(float64); ok {
			memoryUsage = uint64(usage)
		}
		if limit, ok := memStats["limit"].(float64); ok {
			memoryLimit = uint64(limit)
		}
	}

	// Get network stats
	var networkRx, networkTx uint64
	if networks, ok := v["networks"].(map[string]interface{}); ok {
		for _, net := range networks {
			if netMap, ok := net.(map[string]interface{}); ok {
				if rxBytes, ok := netMap["rx_bytes"].(float64); ok {
					networkRx += uint64(rxBytes)
				}
				if txBytes, ok := netMap["tx_bytes"].(float64); ok {
					networkTx += uint64(txBytes)
				}
			}
		}
	}

	containerStats := &ContainerStats{
		ID:          containerID,
		CPUPercent:  cpuPercent,
		MemoryUsage: memoryUsage,
		MemoryLimit: memoryLimit,
		NetworkRx:   networkRx,
		NetworkTx:   networkTx,
	}

	return containerStats, nil
}

// StartContainer starts a Docker container
func (m *Monitor) StartContainer(ctx context.Context, containerID string) error {
	if m.dockerClient == nil {
		return fmt.Errorf("docker client not available")
	}

	return m.dockerClient.ContainerStart(ctx, containerID, container.StartOptions{})
}

// StopContainer stops a Docker container
func (m *Monitor) StopContainer(ctx context.Context, containerID string, timeout *int) error {
	if m.dockerClient == nil {
		return fmt.Errorf("docker client not available")
	}

	return m.dockerClient.ContainerStop(ctx, containerID, container.StopOptions{Timeout: timeout})
}

// RestartContainer restarts a Docker container
func (m *Monitor) RestartContainer(ctx context.Context, containerID string, timeout *int) error {
	if m.dockerClient == nil {
		return fmt.Errorf("docker client not available")
	}

	return m.dockerClient.ContainerRestart(ctx, containerID, container.StopOptions{Timeout: timeout})
}

// GetContainerLogs retrieves logs from a Docker container
func (m *Monitor) GetContainerLogs(ctx context.Context, containerID string, tail string) (string, error) {
	if m.dockerClient == nil {
		return "", fmt.Errorf("docker client not available")
	}

	options := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       tail,
	}

	logs, err := m.dockerClient.ContainerLogs(ctx, containerID, options)
	if err != nil {
		return "", err
	}
	defer logs.Close()

	logBytes, err := io.ReadAll(logs)
	if err != nil {
		return "", err
	}

	return string(logBytes), nil
}

// InspectContainer retrieves detailed information about a container
func (m *Monitor) InspectContainer(ctx context.Context, containerID string) (types.ContainerJSON, error) {
	if m.dockerClient == nil {
		return types.ContainerJSON{}, fmt.Errorf("docker client not available")
	}

	return m.dockerClient.ContainerInspect(ctx, containerID)
}
