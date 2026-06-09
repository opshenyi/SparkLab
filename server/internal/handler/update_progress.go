package handler

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	updateApplyStateIdle       = "idle"
	updateApplyStateChecking   = "checking"
	updateApplyStateFetching   = "fetching"
	updateApplyStatePulling    = "pulling"
	updateApplyStateBuilding   = "building"
	updateApplyStateRestarting = "restarting"
	updateApplyStateCompleted  = "completed"
	updateApplyStateFailed     = "failed"
)

const completedUpdateProgressVisibleFor = 5 * time.Minute

type updateApplyProgress struct {
	ID                     string     `json:"id"`
	State                  string     `json:"state"`
	Message                string     `json:"message"`
	Repo                   string     `json:"repo"`
	Branch                 string     `json:"branch"`
	FromVersion            string     `json:"fromVersion"`
	ToVersion              string     `json:"toVersion"`
	BeforeCommit           string     `json:"beforeCommit,omitempty"`
	CurrentCommit          string     `json:"currentCommit,omitempty"`
	TargetCommit           string     `json:"targetCommit,omitempty"`
	StartedAt              time.Time  `json:"startedAt"`
	UpdatedAt              time.Time  `json:"updatedAt"`
	CompletedAt            *time.Time `json:"completedAt,omitempty"`
	Error                  string     `json:"error,omitempty"`
	OutputTail             string     `json:"outputTail,omitempty"`
	LogPath                string     `json:"logPath,omitempty"`
	ContainerLogPath       string     `json:"containerLogPath,omitempty"`
	RefreshRecommended     bool       `json:"refreshRecommended"`
	AutoReloadDelaySeconds int        `json:"autoReloadDelaySeconds,omitempty"`
}

func (h *Handler) UpdateApplyStatus(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	progress, err := h.readUpdateProgress("")
	if err != nil {
		c.JSON(200, updateApplyProgress{
			State:     updateApplyStateIdle,
			Message:   "暂无更新任务",
			UpdatedAt: time.Now(),
		})
		return
	}

	progress = h.refreshUpdateProgress(ctx, progress)
	if progress.State == updateApplyStateCompleted && progress.CompletedAt != nil &&
		time.Since(*progress.CompletedAt) > completedUpdateProgressVisibleFor {
		c.JSON(200, updateApplyProgress{
			State:     updateApplyStateIdle,
			Message:   "暂无更新任务",
			UpdatedAt: time.Now(),
		})
		return
	}
	c.JSON(200, progress)
}

func (h *Handler) newUpdateProgress(status updateStatus, state, message string) *updateApplyProgress {
	now := time.Now()
	return &updateApplyProgress{
		ID:            now.Format("20060102150405"),
		State:         state,
		Message:       message,
		Repo:          status.Repo,
		Branch:        status.Branch,
		FromVersion:   status.CurrentVersion,
		ToVersion:     status.LatestVersion,
		BeforeCommit:  status.CurrentCommit,
		CurrentCommit: status.CurrentCommit,
		TargetCommit:  status.LatestCommit,
		StartedAt:     now,
		UpdatedAt:     now,
	}
}

func (h *Handler) saveUpdateProgress(repoDir string, progress *updateApplyProgress) {
	if progress == nil {
		return
	}
	progress.UpdatedAt = time.Now()
	if progress.LogPath == "" {
		progress.LogPath = h.updateLogPath(repoDir)
	}
	_ = writeJSONAtomic(h.updateProgressPath(repoDir), progress)
}

func (h *Handler) failUpdateProgress(repoDir string, progress *updateApplyProgress, message, output string) {
	if progress == nil {
		return
	}
	now := time.Now()
	progress.State = updateApplyStateFailed
	progress.Message = message
	progress.Error = message
	progress.OutputTail = tailText(output, 8000)
	progress.CompletedAt = &now
	progress.RefreshRecommended = false
	h.saveUpdateProgress(repoDir, progress)
}

func (h *Handler) readUpdateProgress(repoDir string) (*updateApplyProgress, error) {
	b, err := os.ReadFile(h.updateProgressPath(repoDir))
	if err != nil {
		return nil, err
	}
	var progress updateApplyProgress
	if err := json.Unmarshal(b, &progress); err != nil {
		return nil, err
	}
	return &progress, nil
}

func (h *Handler) refreshUpdateProgress(ctx context.Context, progress *updateApplyProgress) *updateApplyProgress {
	if progress == nil || progress.State != updateApplyStateRestarting {
		return progress
	}

	running := currentRunningBuild()
	state, err := localGitState(ctx)
	if err != nil {
		return progress
	}

	done := false
	if progress.TargetCommit != "" {
		done = running.Commit != "" && strings.EqualFold(running.Commit, progress.TargetCommit)
	} else {
		done = progress.ToVersion != "" && compareVersions(running.Version, progress.ToVersion) >= 0
	}
	if !done {
		if time.Since(progress.UpdatedAt) > updateScriptTimeout()+10*time.Minute {
			now := time.Now()
			progress.State = updateApplyStateFailed
			progress.Message = "服务重启未确认完成，请查看更新日志"
			progress.Error = progress.Message
			progress.CompletedAt = &now
			progress.RefreshRecommended = false
			h.saveUpdateProgress(state.RepoDir, progress)
		}
		return progress
	}

	now := time.Now()
	progress.State = updateApplyStateCompleted
	progress.Message = "更新完成，正在刷新页面"
	progress.CurrentCommit = running.Commit
	progress.CompletedAt = &now
	progress.RefreshRecommended = true
	progress.AutoReloadDelaySeconds = 2
	h.saveUpdateProgress(state.RepoDir, progress)
	return progress
}

func (h *Handler) updateProgressPath(repoDir string) string {
	if path := strings.TrimSpace(os.Getenv("SPARKLAB_UPDATE_STATUS_FILE")); path != "" {
		return path
	}
	return filepath.Join(h.updateRuntimeDir(repoDir), "update-status.json")
}

func (h *Handler) updateLogPath(repoDir string) string {
	if path := strings.TrimSpace(os.Getenv("SPARKLAB_UPDATE_LOG")); path != "" {
		return path
	}
	return filepath.Join(h.updateRuntimeDir(repoDir), "update-redeploy.log")
}

func (h *Handler) updateRuntimeDir(repoDir string) string {
	if dir := strings.TrimSpace(os.Getenv("SPARKLAB_UPDATE_DIR")); dir != "" {
		return dir
	}
	if dbPath := strings.TrimSpace(h.cfg.DatabasePath); dbPath != "" && dbPath != ":memory:" {
		return filepath.Dir(dbPath)
	}
	if strings.TrimSpace(repoDir) != "" {
		return filepath.Join(repoDir, "data", "server")
	}
	return filepath.Join(".", "data", "server")
}

func writeJSONAtomic(path string, v any) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("empty path")
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(path)
		return os.Rename(tmp, path)
	}
	return nil
}

func tailText(text string, maxChars int) string {
	if maxChars <= 0 || len(text) <= maxChars {
		return text
	}
	return text[len(text)-maxChars:]
}
