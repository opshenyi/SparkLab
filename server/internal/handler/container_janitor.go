package handler

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"

	"sparklab/server/internal/model"
)

func (h *Handler) StartContainerJanitor() {
	if envBool("CONTAINER_JANITOR_DISABLED", false) {
		log.Println("[container-janitor] disabled by CONTAINER_JANITOR_DISABLED")
		return
	}

	intervalSeconds := envInt("CONTAINER_JANITOR_INTERVAL_SECONDS", 60)
	if intervalSeconds <= 0 {
		intervalSeconds = 60
	}
	ticker := time.NewTicker(time.Duration(intervalSeconds) * time.Second)

	go func() {
		defer ticker.Stop()
		h.runContainerJanitor()
		for range ticker.C {
			h.runContainerJanitor()
		}
	}()
}

func (h *Handler) runContainerJanitor() {
	now := time.Now()
	h.stopExpiredRunningContainers(now)
	h.markStaleCreatingContainers(now)
}

func (h *Handler) stopExpiredRunningContainers(now time.Time) {
	var containers []model.Container
	if err := h.db.Where("status = ? AND autoStopAt IS NOT NULL AND autoStopAt <= ?", "running", now).Find(&containers).Error; err != nil {
		log.Printf("[container-janitor] load expired containers failed: %v", err)
		return
	}

	for _, ct := range containers {
		if ct.ContainerID != "" {
			if err := h.stopDockerContainerByID(ct.ContainerID); err != nil {
				log.Printf("[container-janitor] stop expired container %s failed: %v", ct.ID, err)
				continue
			}
		}
		updates := map[string]any{
			"status":     "stopped",
			"stoppedAt":  now,
			"autoStopAt": nil,
		}
		if err := h.db.Model(&model.Container{}).Where("id = ?", ct.ID).Updates(updates).Error; err != nil {
			log.Printf("[container-janitor] mark expired container %s stopped failed: %v", ct.ID, err)
			continue
		}
		log.Printf("[container-janitor] stopped expired lab container %s", ct.ID)
	}
}

func (h *Handler) markStaleCreatingContainers(now time.Time) {
	timeoutMinutes := envInt("CONTAINER_CREATING_TIMEOUT_MINUTES", 10)
	if timeoutMinutes <= 0 {
		timeoutMinutes = 10
	}
	cutoff := now.Add(-time.Duration(timeoutMinutes) * time.Minute)

	var containers []model.Container
	if err := h.db.Where("status = ? AND createdAt <= ?", "creating", cutoff).Find(&containers).Error; err != nil {
		log.Printf("[container-janitor] load stale creating containers failed: %v", err)
		return
	}

	for _, ct := range containers {
		if ct.ContainerID != "" {
			if err := h.stopDockerContainerByID(ct.ContainerID); err != nil {
				log.Printf("[container-janitor] stop stale creating container %s failed: %v", ct.ID, err)
			}
		}
		updates := map[string]any{
			"status":     "error",
			"stoppedAt":  now,
			"autoStopAt": nil,
		}
		if err := h.db.Model(&model.Container{}).Where("id = ?", ct.ID).Updates(updates).Error; err != nil {
			log.Printf("[container-janitor] mark stale creating container %s error failed: %v", ct.ID, err)
			continue
		}
		log.Printf("[container-janitor] marked stale creating container %s as error", ct.ID)
	}
}

func (h *Handler) stopDockerContainerByID(containerID string) error {
	resp, err := h.dockerRequest(nil, http.MethodPost, "/containers/"+url.PathEscape(containerID)+"/stop?t=5", nil, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNoContent || resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusNotModified || resp.StatusCode == http.StatusNotFound {
		return nil
	}
	body, _ := io.ReadAll(resp.Body)
	if len(body) == 0 {
		return fmt.Errorf("docker api status %d", resp.StatusCode)
	}
	return fmt.Errorf("%s", string(body))
}
