package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type gitState struct {
	RepoDir string
	Branch  string
	Commit  string
	Dirty   bool
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

func (h *Handler) CheckForUpdates(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	latest, err := h.githubLatestCommit(ctx)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"message": "检查 GitHub 更新失败: " + err.Error()})
		return
	}

	state, stateErr := localGitState(ctx)
	resp := gin.H{
		"repo":          h.cfg.GitHubRepo,
		"branch":        h.cfg.GitBranch,
		"latestCommit":  latest.SHA,
		"latestUrl":     latest.HTMLURL,
		"latestMessage": latest.Commit.Message,
		"latestAuthor":  latest.Commit.Author.Name,
		"latestDate":    latest.Commit.Author.Date,
		"checkedAt":     time.Now(),
	}

	if stateErr != nil {
		resp["hasUpdate"] = false
		resp["canApply"] = false
		resp["localError"] = stateErr.Error()
		c.JSON(http.StatusOK, resp)
		return
	}

	resp["repoDir"] = state.RepoDir
	resp["currentBranch"] = state.Branch
	resp["currentCommit"] = state.Commit
	resp["dirty"] = state.Dirty
	resp["hasUpdate"] = state.Commit != "" && latest.SHA != "" && !strings.EqualFold(state.Commit, latest.SHA)
	resp["canApply"] = !state.Dirty

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) ApplyUpdate(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Minute)
	defer cancel()

	before, err := localGitState(ctx)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "当前部署目录不是可更新的 Git 仓库: " + err.Error()})
		return
	}
	if before.Dirty {
		c.JSON(http.StatusConflict, gin.H{"message": "工作区存在未提交改动，已拒绝自动更新"})
		return
	}

	fetchOut, fetchErr := runGit(ctx, before.RepoDir, "fetch", "origin", h.cfg.GitBranch)
	if fetchErr != nil {
		c.JSON(http.StatusBadGateway, gin.H{"message": "拉取 GitHub 更新失败: " + fetchErr.Error(), "output": fetchOut})
		return
	}

	pullOut, pullErr := runGit(ctx, before.RepoDir, "pull", "--ff-only", "origin", h.cfg.GitBranch)
	if pullErr != nil {
		c.JSON(http.StatusConflict, gin.H{"message": "无法快进更新: " + pullErr.Error(), "output": pullOut})
		return
	}

	after, err := localGitState(ctx)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"message":         "更新已执行，但无法读取更新后的 Git 状态",
			"output":          fetchOut + pullOut,
			"restartRequired": true,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":         "更新完成，重启服务后生效",
		"beforeCommit":    before.Commit,
		"afterCommit":     after.Commit,
		"output":          fetchOut + pullOut,
		"restartRequired": true,
	})
}

func (h *Handler) githubLatestCommit(ctx context.Context) (*githubCommitResp, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/commits/%s", h.cfg.GitHubRepo, h.cfg.GitBranch)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "SparkLab-Updater")
	if token := strings.TrimSpace(os.Getenv("GITHUB_TOKEN")); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("GitHub API status %d", resp.StatusCode)
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
