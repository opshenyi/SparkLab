package handler

import (
	"path/filepath"
	"testing"

	"sparklab/server/internal/model"
)

func TestNormalizedLabResourcesClampToCommercialDefaults(t *testing.T) {
	t.Setenv("LAB_CONTAINER_MIN_CPU", "0.2")
	t.Setenv("LAB_CONTAINER_DEFAULT_CPU", "1")
	t.Setenv("LAB_CONTAINER_MAX_CPU", "2")
	t.Setenv("LAB_CONTAINER_MIN_MEMORY_MB", "256")
	t.Setenv("LAB_CONTAINER_DEFAULT_MEMORY_MB", "512")
	t.Setenv("LAB_CONTAINER_MAX_MEMORY_MB", "2048")

	if got := normalizedLabCPU(8); got != 2 {
		t.Fatalf("expected CPU capped to 2, got %v", got)
	}
	if got := normalizedLabCPU(0); got != 1 {
		t.Fatalf("expected default CPU 1, got %v", got)
	}
	if got := normalizedLabMemoryMB(8192); got != 2048 {
		t.Fatalf("expected memory capped to 2048, got %v", got)
	}
	if got := normalizedLabMemoryMB(0); got != 512 {
		t.Fatalf("expected default memory 512, got %v", got)
	}
}

func TestBuildLabHostConfigUsesRestrictedDefaults(t *testing.T) {
	lab := &model.Lab{CPULimit: 1, MemoryLimit: 512, RestartPolicy: "unless-stopped"}

	cfg := buildLabHostConfig(lab)

	if cfg["Privileged"] != false {
		t.Fatal("expected privileged mode disabled")
	}
	if cfg["NetworkMode"] != "bridge" {
		t.Fatalf("expected bridge network, got %v", cfg["NetworkMode"])
	}
	if cfg["PidsLimit"] != int64(256) {
		t.Fatalf("expected pids limit 256, got %v", cfg["PidsLimit"])
	}
	if cfg["CapDrop"].([]string)[0] != "ALL" {
		t.Fatalf("expected all capabilities dropped, got %v", cfg["CapDrop"])
	}
	restart := cfg["RestartPolicy"].(map[string]any)
	if restart["Name"] != "no" {
		t.Fatalf("expected restart policy disabled by default, got %v", restart["Name"])
	}
}

func TestHostBindAllowedRequiresExplicitRoot(t *testing.T) {
	root := t.TempDir()
	inside := filepath.Join(root, "dataset")
	outside := t.TempDir()

	t.Setenv("LAB_CONTAINER_ALLOW_HOST_BINDS", "false")
	t.Setenv("LAB_CONTAINER_HOST_BIND_ROOT", root)
	if labHostBindAllowed(inside) {
		t.Fatal("expected host bind disabled by default")
	}

	t.Setenv("LAB_CONTAINER_ALLOW_HOST_BINDS", "true")
	if !labHostBindAllowed(inside) {
		t.Fatal("expected bind inside configured root to be allowed")
	}
	if labHostBindAllowed(outside) {
		t.Fatal("expected bind outside configured root to be denied")
	}
}

func TestHostPortRangeDefaultsToLabRange(t *testing.T) {
	if !hostPortInLabRange(30000) || !hostPortInLabRange(49999) {
		t.Fatal("expected default lab port range to include 30000-49999")
	}
	if hostPortInLabRange(80) {
		t.Fatal("expected low host port to be rejected")
	}
}

func TestLabContainerPortSpecDefaultsProtocolAndRejectsInvalid(t *testing.T) {
	spec, ok := labContainerPortSpec(map[string]any{"containerPort": float64(8080)})
	if !ok || spec != "8080/tcp" {
		t.Fatalf("expected default tcp port spec, got %q ok=%v", spec, ok)
	}
	if _, ok := labContainerPortSpec(map[string]any{"containerPort": float64(8080), "protocol": "sctp"}); ok {
		t.Fatal("expected unsupported protocol to be rejected")
	}
	if _, ok := labContainerPortSpec(map[string]any{"containerPort": float64(70000)}); ok {
		t.Fatal("expected invalid container port to be rejected")
	}
}
