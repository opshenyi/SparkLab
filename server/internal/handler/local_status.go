package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

type dockerVolumeListResp struct {
	Volumes []map[string]any `json:"Volumes"`
}

func (h *Handler) LocalSystemStatus(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 6*time.Second)
	defer cancel()

	local, err := h.ensureLocalDockerServer()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Prepare local Docker node failed"})
		return
	}

	status := gin.H{
		"checkedAt": time.Now(),
		"docker": gin.H{
			"id":     local.ID,
			"name":   local.Name,
			"host":   local.Host,
			"status": "offline",
		},
	}

	info, dockerOK := h.localDockerInfo(local)
	if dockerOK {
		running, total, _ := h.listContainerCounts(local)
		if total == 0 {
			total = info.Containers
		}
		if running == 0 {
			running = info.ContainersRunning
		}

		status["docker"] = gin.H{
			"id":                local.ID,
			"name":              local.Name,
			"host":              local.Host,
			"status":            "online",
			"version":           info.ServerVersion,
			"operatingSystem":   info.OperatingSystem,
			"kernelVersion":     info.KernelVersion,
			"architecture":      info.Architecture,
			"containers":        total,
			"containersRunning": running,
			"images":            h.localDockerImageCount(local),
			"networks":          h.localDockerNetworkCount(local),
			"volumes":           h.localDockerVolumeCount(local),
		}
	}

	status["host"] = h.localHostInfo(info)
	status["resource"] = h.localResourceInfo(ctx)
	status["network"] = h.localNetworkInfo(ctx)
	c.JSON(http.StatusOK, status)
}

func (h *Handler) localDockerInfo(server *model.Server) (dockerInfo, bool) {
	var info dockerInfo
	resp, err := h.dockerRequest(server, http.MethodGet, "/info", nil, nil)
	if err != nil {
		return info, false
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return info, false
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return info, false
	}
	return info, true
}

func (h *Handler) localDockerImageCount(server *model.Server) int {
	resp, err := h.dockerRequest(server, http.MethodGet, "/images/json", nil, nil)
	if err != nil {
		return 0
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return 0
	}
	var images []dockerImageSummary
	if err := json.NewDecoder(resp.Body).Decode(&images); err != nil {
		return 0
	}
	return len(images)
}

func (h *Handler) localDockerNetworkCount(server *model.Server) int {
	resp, err := h.dockerRequest(server, http.MethodGet, "/networks", nil, nil)
	if err != nil {
		return 0
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return 0
	}
	var networks []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&networks); err != nil {
		return 0
	}
	return len(networks)
}

func (h *Handler) localDockerVolumeCount(server *model.Server) int {
	resp, err := h.dockerRequest(server, http.MethodGet, "/volumes", nil, nil)
	if err != nil {
		return 0
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return 0
	}
	var volumes dockerVolumeListResp
	if err := json.NewDecoder(resp.Body).Decode(&volumes); err != nil {
		return 0
	}
	return len(volumes.Volumes)
}

func (h *Handler) localHostInfo(info dockerInfo) gin.H {
	out := gin.H{
		"name":            info.Name,
		"operatingSystem": info.OperatingSystem,
		"kernelVersion":   info.KernelVersion,
		"architecture":    info.Architecture,
		"dockerVersion":   info.ServerVersion,
		"bootTime":        uint64(0),
		"uptime":          uint64(0),
	}
	if hostInfo, err := host.Info(); err == nil {
		if out["name"] == "" {
			out["name"] = hostInfo.Hostname
		}
		if out["operatingSystem"] == "" {
			out["operatingSystem"] = hostInfo.Platform + " " + hostInfo.PlatformVersion
		}
		if out["kernelVersion"] == "" {
			out["kernelVersion"] = hostInfo.KernelVersion
		}
		if out["architecture"] == "" {
			out["architecture"] = hostInfo.KernelArch
		}
		out["bootTime"] = hostInfo.BootTime
		out["uptime"] = hostInfo.Uptime
	}
	return out
}

func (h *Handler) localResourceInfo(ctx context.Context) gin.H {
	out := gin.H{
		"cpuUsage":    float64(0),
		"cpuCores":    0,
		"cpuModel":    "",
		"loadAvg1":    float64(0),
		"loadAvg5":    float64(0),
		"loadAvg15":   float64(0),
		"memoryTotal": uint64(0),
		"memoryUsed":  uint64(0),
		"memoryUsage": float64(0),
		"diskPath":    "/",
		"diskTotal":   uint64(0),
		"diskUsed":    uint64(0),
		"diskUsage":   float64(0),
	}

	if percent, err := cpu.PercentWithContext(ctx, 400*time.Millisecond, false); err == nil && len(percent) > 0 {
		out["cpuUsage"] = percent[0]
	}
	if infos, err := cpu.InfoWithContext(ctx); err == nil && len(infos) > 0 {
		out["cpuCores"] = len(infos)
		out["cpuModel"] = infos[0].ModelName
	}
	if avg, err := load.AvgWithContext(ctx); err == nil {
		out["loadAvg1"] = avg.Load1
		out["loadAvg5"] = avg.Load5
		out["loadAvg15"] = avg.Load15
	}
	if vm, err := mem.VirtualMemoryWithContext(ctx); err == nil {
		out["memoryTotal"] = vm.Total
		out["memoryUsed"] = vm.Used
		out["memoryUsage"] = vm.UsedPercent
	}
	if du, err := disk.UsageWithContext(ctx, "/"); err == nil {
		out["diskTotal"] = du.Total
		out["diskUsed"] = du.Used
		out["diskUsage"] = du.UsedPercent
	}
	return out
}

func (h *Handler) localNetworkInfo(ctx context.Context) gin.H {
	out := gin.H{
		"bytesSent": uint64(0),
		"bytesRecv": uint64(0),
	}
	if counters, err := net.IOCountersWithContext(ctx, false); err == nil && len(counters) > 0 {
		out["bytesSent"] = counters[0].BytesSent
		out["bytesRecv"] = counters[0].BytesRecv
	}
	return out
}
