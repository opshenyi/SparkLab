package handler

import (
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type authAttemptState struct {
	failures    []time.Time
	lockedUntil time.Time
}

type authAttemptLimiter struct {
	mu          sync.Mutex
	attempts    map[string]*authAttemptState
	maxFailures int
	window      time.Duration
	lockout     time.Duration
	now         func() time.Time
}

func newAuthAttemptLimiterFromEnv() *authAttemptLimiter {
	maxFailures := envInt("AUTH_MAX_FAILED_ATTEMPTS", 8)
	windowMinutes := envInt("AUTH_ATTEMPT_WINDOW_MINUTES", 10)
	lockoutMinutes := envInt("AUTH_LOCKOUT_MINUTES", 10)
	if windowMinutes <= 0 {
		windowMinutes = 10
	}
	if lockoutMinutes <= 0 {
		lockoutMinutes = 10
	}
	return newAuthAttemptLimiter(maxFailures, time.Duration(windowMinutes)*time.Minute, time.Duration(lockoutMinutes)*time.Minute)
}

func newAuthAttemptLimiter(maxFailures int, window, lockout time.Duration) *authAttemptLimiter {
	return &authAttemptLimiter{
		attempts:    make(map[string]*authAttemptState),
		maxFailures: maxFailures,
		window:      window,
		lockout:     lockout,
		now:         time.Now,
	}
}

func (l *authAttemptLimiter) allow(keys []string) (time.Duration, bool) {
	if l == nil || l.maxFailures <= 0 {
		return 0, true
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	var longestRetry time.Duration
	for _, key := range compactAuthLimitKeys(keys) {
		state := l.stateForKey(key)
		l.pruneState(state, now)
		if state.lockedUntil.After(now) {
			retry := state.lockedUntil.Sub(now)
			if retry > longestRetry {
				longestRetry = retry
			}
		}
	}
	if longestRetry > 0 {
		return longestRetry, false
	}
	return 0, true
}

func (l *authAttemptLimiter) recordFailure(keys []string) {
	if l == nil || l.maxFailures <= 0 {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	for _, key := range compactAuthLimitKeys(keys) {
		state := l.stateForKey(key)
		l.pruneState(state, now)
		state.failures = append(state.failures, now)
		if len(state.failures) >= l.maxFailures {
			state.lockedUntil = now.Add(l.lockout)
		}
	}
}

func (l *authAttemptLimiter) reset(keys []string) {
	if l == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	for _, key := range compactAuthLimitKeys(keys) {
		delete(l.attempts, key)
	}
}

func (l *authAttemptLimiter) stateForKey(key string) *authAttemptState {
	state := l.attempts[key]
	if state == nil {
		state = &authAttemptState{}
		l.attempts[key] = state
	}
	return state
}

func (l *authAttemptLimiter) pruneState(state *authAttemptState, now time.Time) {
	if l.window <= 0 {
		state.failures = nil
		return
	}
	cutoff := now.Add(-l.window)
	kept := state.failures[:0]
	for _, ts := range state.failures {
		if ts.After(cutoff) {
			kept = append(kept, ts)
		}
	}
	state.failures = kept
	if !state.lockedUntil.IsZero() && !state.lockedUntil.After(now) {
		state.lockedUntil = time.Time{}
	}
}

func compactAuthLimitKeys(keys []string) []string {
	seen := make(map[string]struct{}, len(keys))
	out := make([]string, 0, len(keys))
	for _, key := range keys {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, key)
	}
	return out
}

func loginRateLimitKeys(c *gin.Context, username string) []string {
	normalizedUser := strings.ToLower(strings.TrimSpace(username))
	ip := strings.TrimSpace(c.ClientIP())
	if ip == "" {
		ip = "unknown"
	}
	return []string{
		"login:user:" + normalizedUser + ":ip:" + ip,
		"login:user:" + normalizedUser,
	}
}
