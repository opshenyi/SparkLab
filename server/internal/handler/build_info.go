package handler

import (
	"context"
	"os"
	"strings"
	"time"
)

type runningBuildIdentity struct {
	Version    string
	Commit     string
	Source     string
	DetectedAt time.Time
}

var runningBuild = detectRunningBuildIdentity()

func currentRunningBuild() runningBuildIdentity {
	return runningBuild
}

func detectRunningBuildIdentity() runningBuildIdentity {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	info := runningBuildIdentity{DetectedAt: time.Now()}

	if version := normalizeBuildVersion(os.Getenv("SPARKLAB_VERSION")); version != "" {
		info.Version = version
		info.Source = appendBuildSource(info.Source, "env")
	}
	if commit := normalizeBuildCommit(os.Getenv("SPARKLAB_COMMIT")); commit != "" {
		info.Commit = commit
		info.Source = appendBuildSource(info.Source, "env")
	}

	if info.Version == "" {
		if manifest, err := localManifest(ctx); err == nil {
			info.Version = manifest.Version
			info.Source = appendBuildSource(info.Source, "startup-manifest")
		}
	}
	if info.Commit == "" {
		if state, err := localGitState(ctx); err == nil {
			info.Commit = state.Commit
			info.Source = appendBuildSource(info.Source, "startup-git")
		}
	}

	if info.Version == "" {
		info.Version = "0.0.0"
	}
	if info.Source == "" {
		info.Source = "fallback"
	}
	return info
}

func normalizeBuildVersion(v string) string {
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	if v == "" || strings.EqualFold(v, "unknown") || v == "0.0.0" {
		return ""
	}
	return v
}

func normalizeBuildCommit(v string) string {
	v = strings.TrimSpace(v)
	if v == "" || strings.EqualFold(v, "unknown") || strings.EqualFold(v, "dev") {
		return ""
	}
	return v
}

func appendBuildSource(current, next string) string {
	if current == "" {
		return next
	}
	if strings.Contains(","+current+",", ","+next+",") {
		return current
	}
	return current + "," + next
}
