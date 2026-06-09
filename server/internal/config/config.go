package config

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"os"
	"strings"
)

type Config struct {
	Port             string
	WebURL           string
	JWTSecret        string
	JWTExpires       string
	DatabasePath     string
	DockerHost       string
	GitHubRepo       string
	GitBranch        string
	CookieSecure     bool
	CookieSameSite   http.SameSite
	SecurityWarnings []string
}

func Load() *Config {
	warnings := make([]string, 0)
	port := getEnv("PORT", "3001")
	webURL := getEnv("WEB_URL", "http://localhost:3000")
	jwtSecret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if isUnsafeJWTSecret(jwtSecret) && !envBool("SPARKLAB_ALLOW_INSECURE_DEFAULTS", false) {
		jwtSecret = randomHex(32)
		warnings = append(warnings, "JWT_SECRET is empty or uses a known unsafe placeholder; generated an ephemeral runtime secret. Set a stable random JWT_SECRET before production use.")
	}
	jwtExpires := getEnv("JWT_EXPIRES_IN", "7d")
	databaseURL := getEnv("DATABASE_URL", "file:./prisma/spark_lab.db")
	dockerHost := normalizeDockerHost(getEnv("DOCKER_HOST", "unix:///var/run/docker.sock"))
	githubRepo := normalizeGitHubRepo(getEnv("GITHUB_REPO", "opshenyi/SparkLab"))
	gitBranch := getEnv("GITHUB_BRANCH", "main")
	cookieSecure := envBool("COOKIE_SECURE", defaultCookieSecure(webURL))
	cookieSameSite := parseSameSite(getEnv("COOKIE_SAMESITE", "lax"))
	if cookieSameSite == http.SameSiteNoneMode && !cookieSecure {
		cookieSameSite = http.SameSiteLaxMode
		warnings = append(warnings, "COOKIE_SAMESITE=None requires COOKIE_SECURE=true; downgraded SameSite to Lax.")
	}

	return &Config{
		Port:             port,
		WebURL:           webURL,
		JWTSecret:        jwtSecret,
		JWTExpires:       jwtExpires,
		DatabasePath:     normalizeDBPath(databaseURL),
		DockerHost:       dockerHost,
		GitHubRepo:       githubRepo,
		GitBranch:        gitBranch,
		CookieSecure:     cookieSecure,
		CookieSameSite:   cookieSameSite,
		SecurityWarnings: warnings,
	}
}

func isUnsafeJWTSecret(secret string) bool {
	switch strings.TrimSpace(secret) {
	case "", "your-secret-key", "change-this-secret-before-production":
		return true
	default:
		return false
	}
}

func randomHex(bytes int) string {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func defaultCookieSecure(webURL string) bool {
	for _, origin := range strings.Split(webURL, ",") {
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(origin)), "https://") {
			return true
		}
	}
	return false
}

func parseSameSite(raw string) http.SameSite {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "strict":
		return http.SameSiteStrictMode
	case "none":
		return http.SameSiteNoneMode
	case "default":
		return http.SameSiteDefaultMode
	default:
		return http.SameSiteLaxMode
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

func envBool(key string, fallback bool) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes" || v == "on"
}
