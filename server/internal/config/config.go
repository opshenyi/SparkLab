package config

import (
	"os"
	"strings"
)

type Config struct {
	Port         string
	WebURL       string
	JWTSecret    string
	JWTExpires   string
	DatabasePath string
	DockerHost   string
	GitHubRepo   string
	GitBranch    string
}

func Load() *Config {
	port := getEnv("PORT", "3001")
	webURL := getEnv("WEB_URL", "http://localhost:3000")
	jwtSecret := getEnv("JWT_SECRET", "your-secret-key")
	jwtExpires := getEnv("JWT_EXPIRES_IN", "7d")
	databaseURL := getEnv("DATABASE_URL", "file:./prisma/spark_lab.db")
	dockerHost := normalizeDockerHost(getEnv("DOCKER_HOST", "unix:///var/run/docker.sock"))
	githubRepo := normalizeGitHubRepo(getEnv("GITHUB_REPO", "opshenyi/SparkLab"))
	gitBranch := getEnv("GITHUB_BRANCH", "main")

	return &Config{
		Port:         port,
		WebURL:       webURL,
		JWTSecret:    jwtSecret,
		JWTExpires:   jwtExpires,
		DatabasePath: normalizeDBPath(databaseURL),
		DockerHost:   dockerHost,
		GitHubRepo:   githubRepo,
		GitBranch:    gitBranch,
	}
}

func normalizeDBPath(databaseURL string) string {
	if strings.HasPrefix(databaseURL, "file:") {
		return strings.TrimPrefix(databaseURL, "file:")
	}
	return databaseURL
}

func normalizeDockerHost(dockerHost string) string {
	host := strings.TrimSpace(dockerHost)
	if strings.HasPrefix(host, "unix://") {
		return host
	}
	if strings.HasPrefix(host, "/") {
		return "unix://" + host
	}
	return "unix:///var/run/docker.sock"
}

func normalizeGitHubRepo(repo string) string {
	repo = strings.TrimSpace(repo)
	repo = strings.TrimPrefix(repo, "https://github.com/")
	repo = strings.TrimPrefix(repo, "http://github.com/")
	repo = strings.TrimSuffix(repo, ".git")
	repo = strings.Trim(repo, "/")
	if repo == "" {
		return "opshenyi/SparkLab"
	}
	return repo
}

func getEnv(key, fallback string) string {
	v := os.Getenv(key)
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}
