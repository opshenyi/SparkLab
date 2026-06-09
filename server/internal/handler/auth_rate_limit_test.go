package handler

import (
	"testing"
	"time"
)

func TestAuthAttemptLimiterLocksAfterThreshold(t *testing.T) {
	now := time.Date(2026, 6, 9, 10, 0, 0, 0, time.UTC)
	limiter := newAuthAttemptLimiter(3, 10*time.Minute, 5*time.Minute)
	limiter.now = func() time.Time { return now }
	keys := []string{"login:user:admin:ip:127.0.0.1"}

	for i := 0; i < 2; i++ {
		if _, ok := limiter.allow(keys); !ok {
			t.Fatalf("attempt %d should be allowed before threshold", i+1)
		}
		limiter.recordFailure(keys)
	}

	if _, ok := limiter.allow(keys); !ok {
		t.Fatal("third attempt should still be allowed before recording the threshold failure")
	}
	limiter.recordFailure(keys)

	retryAfter, ok := limiter.allow(keys)
	if ok {
		t.Fatal("expected limiter to block after threshold failures")
	}
	if retryAfter <= 0 {
		t.Fatalf("expected positive retry duration, got %v", retryAfter)
	}
}

func TestAuthAttemptLimiterWindowAndReset(t *testing.T) {
	now := time.Date(2026, 6, 9, 10, 0, 0, 0, time.UTC)
	limiter := newAuthAttemptLimiter(2, time.Minute, 5*time.Minute)
	limiter.now = func() time.Time { return now }
	keys := []string{"login:user:student:ip:127.0.0.1", "login:ip:127.0.0.1"}

	limiter.recordFailure(keys)
	now = now.Add(2 * time.Minute)

	if _, ok := limiter.allow(keys); !ok {
		t.Fatal("old failures should fall out of the rolling window")
	}
	limiter.recordFailure(keys)
	limiter.recordFailure(keys)
	if _, ok := limiter.allow(keys); ok {
		t.Fatal("expected lockout after fresh failures")
	}

	limiter.reset(keys)
	if _, ok := limiter.allow(keys); !ok {
		t.Fatal("reset should clear lockout for successful login")
	}
}
