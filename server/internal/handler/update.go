package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const updateManifestFile = "update-manifest.json"

type gitState struct {
	RepoDir string
	Branch  string
	Commit  string
	Dirty   bool
}

type updateManifest struct {
	AppID        string                `json:"appId"`
	Version      string                `json:"version"`
	Channel      string                `json:"channel"`
	ReleasedAt   string                `json:"releasedAt"`
	Title        string                `json:"title"`
	Mandatory    bool                  `json:"mandatory"`
	Announcement updateAnnouncement    `json:"announcement"`
	Changelog    []updateReleaseNote   `json:"changelog"`
	Scripts      updateManifestScripts `json:"scripts"`
}

type updateAnnouncement struct {
	Enabled bool   `json:"enabled"`
	Level   string `json:"level"`
	Title   string `json:"title"`
	Message string `json:"message"`
}

type updateReleaseNote struct {
	Version string   `json:"version"`
	Date    string   `json:"date"`
	Title   string   `json:"title"`
	Items   []string `json:"items"`
}

type updateManifestScripts struct {
	Linux   string `json:"linux"`
	Windows string `json:"windows"`
}

type githubCommitResp struct {
	SHA     string `json:"sha"`
	HTMLURL string `json:"html_url"`
	Commit  struct {
		Message string `json:"message"`
		Author  struct {
			Name string    `json:"name"`
			Date time.Time `json:"date"`
		} `json:"author"`
	} `json:"commit"`
}

type githubContentsResp struct {
	Content  string `json:"content"`
	Encoding string `json:"encoding"`
}

type updateStatus struct {
	Repo                      string                `json:"repo"`
	Branch                    string                `json:"branch"`
	CurrentVersion            string                `json:"currentVersion"`
	LatestVersion             string                `json:"latestVersion"`
	CurrentCommit             string                `json:"currentCommit,omitempty"`
	LatestCommit              string                `json:"latestCommit,omitempty"`
	RunningVersion            string                `json:"runningVersion"`
	RunningCommit             string                `json:"runningCommit,omitempty"`
	RunningSource             string                `json:"runningSource,omitempty"`
	RepoVersion               string                `json:"repoVersion"`
	RepoCommit                string                `json:"repoCommit,omitempty"`
	LatestUrl                 string                `json:"latestUrl,omitempty"`
	LatestMessage             string                `json:"latestMessage,omitempty"`
	LatestAuthor              string                `json:"latestAuthor,omitempty"`
	LatestDate                *time.Time            `json:"latestDate,omitempty"`
	HasUpdate                 bool                  `json:"hasUpdate"`
	CodeChangedWithoutVersion bool                  `json:"codeChangedWithoutVersion"`
	NeedsRedeploy             bool                  `json:"needsRedeploy"`
	CanApply                  bool                  `json:"canApply"`
	Dirty                     bool                  `json:"dirty"`
	RepoDir                   string                `json:"repoDir,omitempty"`
	CurrentBranch             string                `json:"currentBranch,omitempty"`
	Mandatory                 bool                  `json:"mandatory"`
	Title                     string                `json:"title"`
	Announcement              updateAnnouncement    `json:"announcement"`
	Changelog                 []updateReleaseNote   `json:"changelog"`
	Scripts                   updateManifestScripts `json:"scripts,omitempty"`
	CheckedAt                 time.Time             `json:"checkedAt"`
	LocalError                string                `json:"localError,omitempty"`
	RemoteError               string                `json:"remoteError,omitempty"`
}

var remoteUpdateCache = struct {
	sync.Mutex
	key       string
	expiresAt time.Time
	manifest  *updateManifest
	commit    *githubCommitResp
	err       error
}{}

var updateApplyMu sync.Mutex

// PublicUpdateInfo intentionally does not expose release announcements to regular pages.
// Admin update checks still use CheckForUpdates.
func (h *Handler) PublicUpdateInfo(c *gin.Context) {
	c.Header("Cache-Control", "no-store, max-age=0")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	repoManifest, _ := localManifest(ctx)
	running := currentRunningBuild()
	runningVersion := running.Version
	if runningVersion == "" {
		runningVersion = repoManifest.Version
	}

	c.JSON(http.StatusOK, updateStatus{
		CurrentVersion: runningVersion,
		LatestVersion:  runningVersion,
		RunningVersion: runningVersion,
		RunningCommit:  running.Commit,
		RunningSource:  running.Source,
		RepoVersion:    repoManifest.Version,
		HasUpdate:      false,
		CanApply:       false,
		Announcement: updateAnnouncement{
			Enabled: false,
			Level:   "info",
		},
		Changelog: []updateReleaseNote{},
		CheckedAt: time.Now(),
	})
}

// CheckForUpdates returns a detailed update status for administrators.
func (h *Handler) CheckForUpdates(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	status := h.buildUpdateStatus(ctx, true)
	c.JSON(http.StatusOK, status)
}

func (h *Handler) ApplyUpdate(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if existing, err := h.readUpdateProgress(""); err == nil {
		existing = h.refreshUpdateProgress(ctx, existing)
		if isActiveUpdateState(existing.State) {
			c.JSON(http.StatusAccepted, gin.H{
				"message":  "更新任务已在运行，正在继续跟踪进度",
				"progress": existing,
			})
			return
		}
	}

	if !updateApplyMu.TryLock() {
		c.JSON(http.StatusAccepted, gin.H{
			"message": "更新任务正在启动，请稍后查看状态",
		})
		return
	}
	locked := true
	defer func() {
		if locked {
			updateApplyMu.Unlock()
		}
	}()

	if existing, err := h.readUpdateProgress(""); err == nil {
		existing = h.refreshUpdateProgress(ctx, existing)
		if isActiveUpdateState(existing.State) {
			c.JSON(http.StatusAccepted, gin.H{
				"message":  "更新任务已在运行，正在继续跟踪进度",
				"progress": existing,
			})
			return
		}
	}

	status := h.buildUpdateStatus(ctx, true)
	progress := h.newUpdateProgress(status, updateApplyStateChecking, "正在检查 GitHub 更新")
	h.saveUpdateProgress(status.RepoDir, progress)

	if status.RemoteError != "" {
		message := "检查 GitHub 发布清单失败: " + status.RemoteError
		h.failUpdateProgress(status.RepoDir, progress, message, "")
		c.JSON(http.StatusBadGateway, gin.H{"message": message})
		return
	}
	if status.LocalError != "" {
		message := "当前部署目录不是可更新的 Git 仓库: " + status.LocalError
		h.failUpdateProgress(status.RepoDir, progress, message, "")
		c.JSON(http.StatusBadRequest, gin.H{"message": message})
		return
	}
	if status.Dirty {
		message := "工作区存在未提交改动，已拒绝自动更新"
		h.failUpdateProgress(status.RepoDir, progress, message, "")
		c.JSON(http.StatusConflict, gin.H{"message": message})
		return
	}
	if !status.HasUpdate && !status.CodeChangedWithoutVersion && !status.NeedsRedeploy {
		now := time.Now()
		progress.State = updateApplyStateCompleted
		progress.Message = "当前已经是最新版本"
		progress.CompletedAt = &now
		progress.RefreshRecommended = false
		h.saveUpdateProgress(status.RepoDir, progress)
		c.JSON(http.StatusOK, gin.H{"message": "当前已经是最新版本", "status": status, "progress": progress})
		return
	}

	responseProgress := *progress
	c.JSON(http.StatusAccepted, gin.H{
		"message":  "更新任务已启动，页面将持续跟踪进度",
		"status":   status,
		"progress": responseProgress,
	})

	locked = false
	go func(status updateStatus, progress *updateApplyProgress) {
		defer updateApplyMu.Unlock()
		taskCtx, taskCancel := context.WithTimeout(context.Background(), updateScriptTimeout()+3*time.Minute)
		defer taskCancel()
		h.runApplyUpdateTask(taskCtx, status, progress)
	}(status, progress)
}

func (h *Handler) runApplyUpdateTask(ctx context.Context, status updateStatus, progress *updateApplyProgress) {
	before, err := localGitState(ctx)
	if err != nil {
		message := "读取 Git 状态失败: " + err.Error()
		h.failUpdateProgress(status.RepoDir, progress, message, "")
		return
	}
	if progress.BeforeCommit == "" {
		progress.BeforeCommit = before.Commit
	}
	progress.Branch = before.Branch
	progress.State = updateApplyStateFetching
	progress.Message = "正在从 GitHub 拉取更新"
	h.saveUpdateProgress(before.RepoDir, progress)

	fetchOut, fetchErr := runGit(ctx, before.RepoDir, "fetch", "origin", h.cfg.GitBranch)
	if fetchErr != nil {
		message := "拉取 GitHub 更新失败: " + fetchErr.Error()
		h.failUpdateProgress(before.RepoDir, progress, message, fetchOut)
		return
	}
	progress.State = updateApplyStatePulling
	progress.Message = "正在合并 GitHub 最新代码"
	progress.OutputTail = tailText(fetchOut, 8000)
	h.saveUpdateProgress(before.RepoDir, progress)

	pullOut, pullErr := runGit(ctx, before.RepoDir, "pull", "--ff-only", "origin", h.cfg.GitBranch)
	if pullErr != nil {
		output := fetchOut + pullOut
		message := "无法快进更新: " + pullErr.Error()
		h.failUpdateProgress(before.RepoDir, progress, message, output)
		return
	}
	afterPull, afterPullErr := localGitState(ctx)
	if afterPullErr == nil && progress.TargetCommit == "" {
		progress.TargetCommit = afterPull.Commit
	}
	progress.State = updateApplyStateBuilding
	progress.Message = "代码已拉取，正在重建 Docker 镜像"
	progress.OutputTail = tailText(fetchOut+pullOut, 8000)
	h.saveUpdateProgress(before.RepoDir, progress)

	statusFile := h.updateProgressPath(before.RepoDir)
	logFile := h.updateLogPath(before.RepoDir)
	scriptOut, scriptErr := runUpdateScript(ctx, before.RepoDir, status, progress, statusFile, logFile)
	if scriptErr != nil {
		output := fetchOut + pullOut + scriptOut
		message := "代码已拉取，但 Docker 更新脚本执行失败: " + scriptErr.Error()
		h.failUpdateProgress(before.RepoDir, progress, message, output)
		return
	}

	after, err := localGitState(ctx)
	if err != nil {
		progress.State = updateApplyStateRestarting
		progress.Message = "更新已执行，服务正在重启"
		progress.OutputTail = tailText(fetchOut+pullOut+scriptOut, 8000)
		h.saveUpdateProgress(before.RepoDir, progress)
		return
	}

	progress.CurrentCommit = after.Commit
	progress.State = updateApplyStateRestarting
	progress.Message = "镜像已重建，服务正在重启"
	progress.OutputTail = tailText(fetchOut+pullOut+scriptOut, 8000)
	progress.LogPath = logFile
	progress.RefreshRecommended = false
	h.saveUpdateProgress(after.RepoDir, progress)

	clearRemoteUpdateCache()
}

func (h *Handler) buildUpdateStatus(ctx context.Context, includeLocalDetails bool) updateStatus {
	repoManifest, localErr := localManifest(ctx)
	remote, latestCommit, remoteErr := h.remoteRelease(ctx)
	running := currentRunningBuild()
	runningVersion := running.Version
	if runningVersion == "" {
		runningVersion = repoManifest.Version
	}

	status := updateStatus{
		Repo:           h.cfg.GitHubRepo,
		Branch:         h.cfg.GitBranch,
		CurrentVersion: runningVersion,
		RunningVersion: runningVersion,
		RunningCommit:  running.Commit,
		RunningSource:  running.Source,
		CurrentCommit:  running.Commit,
		RepoVersion:    repoManifest.Version,
		CheckedAt:      time.Now(),
	}
	if localErr != nil {
		status.LocalError = localErr.Error()
	}
	if remoteErr != nil {
		status.RemoteError = remoteErr.Error()
	}
	if remote != nil {
		status.LatestVersion = remote.Version
		status.Mandatory = remote.Mandatory
		status.Title = remote.Title
		status.Announcement = remote.Announcement
		status.Changelog = remote.Changelog
		status.Scripts = remote.Scripts
		status.HasUpdate = compareVersions(remote.Version, runningVersion) > 0
	}
	if latestCommit != nil {
		status.LatestCommit = latestCommit.SHA
		status.LatestUrl = latestCommit.HTMLURL
		status.LatestMessage = latestCommit.Commit.Message
		status.LatestAuthor = latestCommit.Commit.Author.Name
		status.LatestDate = &latestCommit.Commit.Author.Date
	}

	state, stateErr := localGitState(ctx)
	if stateErr != nil {
		if status.LocalError == "" {
			status.LocalError = stateErr.Error()
		}
		status.CanApply = false
		return status
	}

	status.RepoCommit = state.Commit
	if status.CurrentCommit == "" {
		status.CurrentCommit = state.Commit
		status.RunningCommit = state.Commit
	}
	status.Dirty = state.Dirty
	status.CanApply = !state.Dirty && status.RemoteError == ""
	status.NeedsRedeploy = repoDiffersFromRunning(status.RepoVersion, status.RunningVersion, status.RepoCommit, status.RunningCommit)
	status.CodeChangedWithoutVersion = !status.HasUpdate &&
		status.CurrentCommit != "" &&
		status.LatestCommit != "" &&
		!strings.EqualFold(status.CurrentCommit, status.LatestCommit)

	if includeLocalDetails {
		status.RepoDir = state.RepoDir
		status.CurrentBranch = state.Branch
	}

	return status
}

func localManifest(ctx context.Context) (*updateManifest, error) {
	state, err := localGitState(ctx)
	if err != nil {
		return fallbackManifest(), err
	}
	manifestPath := filepath.Join(state.RepoDir, updateManifestFile)
	b, err := os.ReadFile(manifestPath)
	if err != nil {
		return fallbackManifest(), err
	}
	var manifest updateManifest
	if err := json.Unmarshal(b, &manifest); err != nil {
		return fallbackManifest(), err
	}
	normalizeManifest(&manifest)
	return &manifest, nil
}

func (h *Handler) remoteRelease(ctx context.Context) (*updateManifest, *githubCommitResp, error) {
	key := h.cfg.GitHubRepo + "@" + h.cfg.GitBranch
	remoteUpdateCache.Lock()
	if remoteUpdateCache.key == key && time.Now().Before(remoteUpdateCache.expiresAt) {
		manifest, commit, err := remoteUpdateCache.manifest, remoteUpdateCache.commit, remoteUpdateCache.err
		remoteUpdateCache.Unlock()
		return manifest, commit, err
	}
	remoteUpdateCache.Unlock()

	manifest, manifestErr := h.githubManifest(ctx)
	commit, commitErr := h.githubLatestCommit(ctx)
	err := manifestErr
	if err == nil {
		err = commitErr
	}

	remoteUpdateCache.Lock()
	remoteUpdateCache.key = key
	remoteUpdateCache.expiresAt = time.Now().Add(updateCacheTTL())
	remoteUpdateCache.manifest = manifest
	remoteUpdateCache.commit = commit
	remoteUpdateCache.err = err
	remoteUpdateCache.Unlock()

	return manifest, commit, err
}

func clearRemoteUpdateCache() {
	remoteUpdateCache.Lock()
	defer remoteUpdateCache.Unlock()
	remoteUpdateCache.key = ""
	remoteUpdateCache.expiresAt = time.Time{}
	remoteUpdateCache.manifest = nil
	remoteUpdateCache.commit = nil
	remoteUpdateCache.err = nil
}

func (h *Handler) githubManifest(ctx context.Context) (*updateManifest, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/contents/%s?ref=%s", h.cfg.GitHubRepo, updateManifestFile, h.cfg.GitBranch)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	h.applyGitHubHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("GitHub contents API status %d", resp.StatusCode)
	}

	var contents githubContentsResp
	if err := json.NewDecoder(resp.Body).Decode(&contents); err != nil {
		return nil, err
	}
	if contents.Encoding != "base64" {
		return nil, fmt.Errorf("unsupported GitHub content encoding %q", contents.Encoding)
	}
	raw, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(contents.Content, "\n", ""))
	if err != nil {
		return nil, err
	}

	var manifest updateManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return nil, err
	}
	normalizeManifest(&manifest)
	return &manifest, nil
}

func (h *Handler) githubLatestCommit(ctx context.Context) (*githubCommitResp, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/commits/%s", h.cfg.GitHubRepo, h.cfg.GitBranch)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	h.applyGitHubHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("GitHub commits API status %d", resp.StatusCode)
	}

	var commit githubCommitResp
	if err := json.NewDecoder(resp.Body).Decode(&commit); err != nil {
		return nil, err
	}
	if strings.TrimSpace(commit.SHA) == "" {
		return nil, fmt.Errorf("GitHub API 返回为空提交")
	}
	return &commit, nil
}

func (h *Handler) applyGitHubHeaders(req *http.Request) {
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "SparkLab-Updater")
	if token := strings.TrimSpace(os.Getenv("GITHUB_TOKEN")); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
}

func localGitState(ctx context.Context) (*gitState, error) {
	repoDir := strings.TrimSpace(os.Getenv("APP_REPO_DIR"))
	var err error
	if repoDir == "" {
		repoDir, err = runGit(ctx, "", "rev-parse", "--show-toplevel")
		if err != nil {
			return nil, err
		}
		repoDir = strings.TrimSpace(repoDir)
	}

	commit, err := runGit(ctx, repoDir, "rev-parse", "HEAD")
	if err != nil {
		return nil, err
	}
	branch, err := runGit(ctx, repoDir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		branch = ""
	}
	status, err := runGit(ctx, repoDir, "status", "--porcelain")
	if err != nil {
		return nil, err
	}

	return &gitState{
		RepoDir: repoDir,
		Branch:  strings.TrimSpace(branch),
		Commit:  strings.TrimSpace(commit),
		Dirty:   strings.TrimSpace(status) != "",
	}, nil
}

func runUpdateScript(ctx context.Context, repoDir string, status updateStatus, progress *updateApplyProgress, statusFile, logFile string) (string, error) {
	script := "scripts/update.sh"
	exe := "bash"
	args := []string{script}
	if status.Scripts.Linux != "" {
		script = status.Scripts.Linux
		args = []string{script}
	}
	if runtime.GOOS == "windows" {
		script = "scripts/update.ps1"
		exe = "powershell"
		args = []string{"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script}
		if status.Scripts.Windows != "" {
			script = status.Scripts.Windows
			args = []string{"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script}
		}
	}
	fullPath := filepath.Join(repoDir, filepath.FromSlash(script))
	if _, err := os.Stat(fullPath); err != nil {
		return "", fmt.Errorf("更新脚本不存在: %s", script)
	}

	cmd := exec.CommandContext(ctx, exe, args...)
	cmd.Dir = repoDir
	cmd.Env = append(os.Environ(),
		"SPARKLAB_FROM_VERSION="+status.CurrentVersion,
		"SPARKLAB_TO_VERSION="+status.LatestVersion,
		"SPARKLAB_UPDATE_STATUS_FILE="+statusFile,
		"SPARKLAB_UPDATE_LOG="+logFile,
	)
	if progress != nil {
		cmd.Env = append(cmd.Env,
			"SPARKLAB_UPDATE_ID="+progress.ID,
			"SPARKLAB_TARGET_COMMIT="+progress.TargetCommit,
		)
	}
	out, err := cmd.CombinedOutput()
	text := string(out)
	if err != nil {
		return text, err
	}
	return text, nil
}

func runGit(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	if strings.TrimSpace(dir) != "" {
		cmd.Dir = dir
	}
	out, err := cmd.CombinedOutput()
	text := string(out)
	if err != nil {
		if text == "" {
			return "", err
		}
		return text, fmt.Errorf("%w: %s", err, strings.TrimSpace(text))
	}
	return text, nil
}

func fallbackManifest() *updateManifest {
	manifest := &updateManifest{
		AppID:   "sparklab",
		Version: "0.0.0",
		Channel: "main",
	}
	normalizeManifest(manifest)
	return manifest
}

func normalizeManifest(manifest *updateManifest) {
	manifest.AppID = strings.TrimSpace(manifest.AppID)
	if manifest.AppID == "" {
		manifest.AppID = "sparklab"
	}
	manifest.Version = strings.TrimPrefix(strings.TrimSpace(manifest.Version), "v")
	if manifest.Version == "" {
		manifest.Version = "0.0.0"
	}
	manifest.Channel = strings.TrimSpace(manifest.Channel)
	if manifest.Channel == "" {
		manifest.Channel = "main"
	}
	if manifest.Announcement.Level == "" {
		manifest.Announcement.Level = "info"
	}
	if manifest.Scripts.Linux == "" {
		manifest.Scripts.Linux = "scripts/update.sh"
	}
	if manifest.Scripts.Windows == "" {
		manifest.Scripts.Windows = "scripts/update.ps1"
	}
}

func repoDiffersFromRunning(repoVersion, runningVersion, repoCommit, runningCommit string) bool {
	if repoCommit != "" && runningCommit != "" && !strings.EqualFold(repoCommit, runningCommit) {
		return true
	}
	return compareVersions(repoVersion, runningVersion) > 0
}

func compareVersions(a, b string) int {
	aa := versionParts(a)
	bb := versionParts(b)
	for i := 0; i < len(aa) || i < len(bb); i++ {
		av, bv := 0, 0
		if i < len(aa) {
			av = aa[i]
		}
		if i < len(bb) {
			bv = bb[i]
		}
		if av > bv {
			return 1
		}
		if av < bv {
			return -1
		}
	}
	return 0
}

func versionParts(v string) []int {
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	v = strings.Split(v, "-")[0]
	raw := strings.Split(v, ".")
	out := make([]int, 0, len(raw))
	for _, part := range raw {
		n, _ := strconv.Atoi(strings.TrimSpace(part))
		out = append(out, n)
	}
	return out
}

func updateCacheTTL() time.Duration {
	sec := envInt("UPDATE_CHECK_CACHE_SECONDS", 300)
	if sec < 0 {
		sec = 0
	}
	return time.Duration(sec) * time.Second
}

func updateScriptTimeout() time.Duration {
	sec := envInt("UPDATE_SCRIPT_TIMEOUT_SECONDS", 600)
	if sec <= 0 {
		sec = 600
	}
	return time.Duration(sec) * time.Second
}
