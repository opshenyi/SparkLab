package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetVolumes 获取所有存储卷
func (h *Handler) GetVolumes(c *gin.Context) {
	// 调用 Docker API 获取存储卷列表
	resp, err := h.dockerRequest(nil, "GET", "/volumes", nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to connect to Docker: %v", err)})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errMsg := readDockerError(resp)
		c.JSON(resp.StatusCode, gin.H{"error": errMsg})
		return
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to parse response: %v", err)})
		return
	}

	// 打印调试信息
	fmt.Printf("Docker volumes response: %+v\n", result)

	c.JSON(http.StatusOK, result)
}

// GetVolume 获取单个存储卷详情
func (h *Handler) GetVolume(c *gin.Context) {
	volumeName := c.Param("name")

	// 调用 Docker API 获取存储卷详情
	resp, err := h.dockerRequest(nil, "GET", "/volumes/"+volumeName, nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to connect to Docker: %v", err)})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.JSON(resp.StatusCode, gin.H{"error": readDockerError(resp)})
		return
	}

	var volume map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&volume); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to parse response: %v", err)})
		return
	}

	c.JSON(http.StatusOK, volume)
}

// CreateVolume 创建存储卷
func (h *Handler) CreateVolume(c *gin.Context) {
	var req struct {
		ServerID string            `json:"serverId"`
		Name     string            `json:"name" binding:"required"`
		Driver   string            `json:"driver"`
		Labels   map[string]string `json:"labels"`
		Options  map[string]string `json:"options"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 设置默认驱动
	driver := req.Driver
	if driver == "" {
		driver = "local"
	}

	// 构建请求体
	createReq := map[string]interface{}{
		"Name":   req.Name,
		"Driver": driver,
	}
	if req.Options != nil && len(req.Options) > 0 {
		createReq["DriverOpts"] = req.Options
	}
	if req.Labels != nil && len(req.Labels) > 0 {
		createReq["Labels"] = req.Labels
	}

	body, err := json.Marshal(createReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to marshal request: %v", err)})
		return
	}

	// 调用 Docker API 创建存储卷
	resp, err := h.dockerRequest(nil, "POST", "/volumes/create", bytes.NewReader(body), map[string]string{
		"Content-Type": "application/json",
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to connect to Docker: %v", err)})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		c.JSON(resp.StatusCode, gin.H{"error": readDockerError(resp)})
		return
	}

	var volume map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&volume); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to parse response: %v", err)})
		return
	}

	c.JSON(http.StatusCreated, volume)
}

// RemoveVolume 删除存储卷
func (h *Handler) RemoveVolume(c *gin.Context) {
	volumeName := c.Param("name")
	force := c.Query("force") == "true"

	// 构建请求路径
	path := "/volumes/" + volumeName
	if force {
		path += "?force=true"
	}

	// 调用 Docker API 删除存储卷
	resp, err := h.dockerRequest(nil, "DELETE", path, nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to connect to Docker: %v", err)})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		c.JSON(resp.StatusCode, gin.H{"error": readDockerError(resp)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Volume removed successfully"})
}
