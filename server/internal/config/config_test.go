package config

import (
	"net/http"
	"testing"
)

func TestLoadGeneratesSecretForUnsafeJWTPlaceholder(t *testing.T) {
	t.Setenv("JWT_SECRET", "change-this-secret-before-production")
	t.Setenv("SPARKLAB_ALLOW_INSECURE_DEFAULTS", "")
	t.Setenv("COOKIE_SECURE", "")

	cfg := Load()

	if cfg.JWTSecret == "" || cfg.JWTSecret == "change-this-secret-before-production" {
		t.Fatalf("expected generated JWT secret, got %q", cfg.JWTSecret)
	}
	if len(cfg.SecurityWarnings) == 0 {
		t.Fatal("expected security warning for unsafe JWT secret")
	}
}

func TestLoadAllowsExplicitJWTSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "prod-secret-with-enough-entropy")
	t.Setenv("COOKIE_SECURE", "")

	cfg := Load()

	if cfg.JWTSecret != "prod-secret-with-enough-entropy" {
		t.Fatalf("expected explicit JWT secret, got %q", cfg.JWTSecret)
	}
}

func TestLoadDerivesSecureCookieFromHTTPSWebURL(t *testing.T) {
	t.Setenv("JWT_SECRET", "prod-secret-with-enough-entropy")
	t.Setenv("WEB_URL", "https://training.example.com")
	t.Setenv("COOKIE_SECURE", "")

	cfg := Load()

	if !cfg.CookieSecure {
		t.Fatal("expected CookieSecure for HTTPS WEB_URL")
	}
	if cfg.CookieSameSite != http.SameSiteLaxMode {
		t.Fatalf("expected lax SameSite by default, got %v", cfg.CookieSameSite)
	}
}

func TestLoadDowngradesSameSiteNoneWithoutSecureCookie(t *testing.T) {
	t.Setenv("JWT_SECRET", "prod-secret-with-enough-entropy")
	t.Setenv("WEB_URL", "http://localhost:3000")
	t.Setenv("COOKIE_SECURE", "")
	t.Setenv("COOKIE_SAMESITE", "none")

	cfg := Load()

	if cfg.CookieSameSite != http.SameSiteLaxMode {
		t.Fatalf("expected SameSite Lax downgrade, got %v", cfg.CookieSameSite)
	}
	if len(cfg.SecurityWarnings) == 0 {
		t.Fatal("expected warning for SameSite=None without secure cookie")
	}
}
