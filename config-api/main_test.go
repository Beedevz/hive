package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// ─── isValidServiceName tests ─────────────────────────────────────────────────

func TestIsValidServiceName(t *testing.T) {
	cases := []struct {
		name  string
		input string
		valid bool
	}{
		{"simple", "Jellyfin", true},
		{"with space", "Jellyfin Home", true},
		{"with hyphen", "my-service", true},
		{"with underscore", "my_service", true},
		{"numbers", "Service123", true},
		{"max length", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"[:64], true},
		{"empty", "", false},
		{"too long", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", false}, // 65 chars
		{"slash", "service/name", false},
		{"dot", "service.name", false},
		{"special chars", "svc@host", false},
		{"semicolon", "svc;drop", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := isValidServiceName(c.input); got != c.valid {
				t.Errorf("isValidServiceName(%q) = %v, want %v", c.input, got, c.valid)
			}
		})
	}
}

// ─── handleProbe routing tests ────────────────────────────────────────────────

func TestHandleProbe_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("POST", "/probe/Jellyfin/status", nil)
	rr := httptest.NewRecorder()
	handleProbe(rr, req)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestHandleProbe_InvalidAction(t *testing.T) {
	req := httptest.NewRequest("GET", "/probe/Jellyfin/unknown", nil)
	rr := httptest.NewRecorder()
	handleProbe(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestHandleProbe_MissingAction(t *testing.T) {
	req := httptest.NewRequest("GET", "/probe/Jellyfin", nil)
	rr := httptest.NewRecorder()
	handleProbe(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestHandleProbe_InvalidName(t *testing.T) {
	req := httptest.NewRequest("GET", "/probe/bad%2Fname/status", nil)
	rr := httptest.NewRecorder()
	handleProbe(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid name, got %d", rr.Code)
	}
}

func TestHandleProbe_ServiceNotFound(t *testing.T) {
	// Returns 404 when config is readable but service doesn't exist,
	// or 500 when the config file itself is not accessible (e.g. CI with no /config mount).
	// Either way it must not return 200.
	req := httptest.NewRequest("GET", "/probe/nonexistent-xyz-service/status", nil)
	rr := httptest.NewRecorder()
	handleProbe(rr, req)
	if rr.Code == http.StatusOK {
		t.Errorf("expected non-200 for unknown service, got 200")
	}
}

// ─── handleProbeStatus tests ──────────────────────────────────────────────────
// Call handleProbeStatus directly with a synthetic serviceItem so tests are
// hermetic — no config file or network dependency beyond the in-process server.

func probeStatusRequest(t *testing.T, svcURL string) (probeResult, int) {
	t.Helper()
	svc := &serviceItem{Name: "test-svc", URL: svcURL}
	req := httptest.NewRequest("GET", "/probe/test-svc/status", nil)
	rr := httptest.NewRecorder()
	handleProbeStatus(rr, req, svc)
	var result probeResult
	json.NewDecoder(rr.Body).Decode(&result)
	return result, rr.Code
}

func TestProbeStatus_Online200(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	result, _ := probeStatusRequest(t, upstream.URL)
	if result.Status != "online" {
		t.Errorf("expected online, got %s", result.Status)
	}
	if result.LatencyMs < 0 {
		t.Errorf("negative latency: %d", result.LatencyMs)
	}
}

func TestProbeStatus_Online404(t *testing.T) {
	// 404 is still "online" — service is reachable, just path not found
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer upstream.Close()

	result, _ := probeStatusRequest(t, upstream.URL)
	if result.Status != "online" {
		t.Errorf("404 should be online, got %s", result.Status)
	}
}

func TestProbeStatus_Offline500(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer upstream.Close()

	result, _ := probeStatusRequest(t, upstream.URL)
	if result.Status != "offline" {
		t.Errorf("500 should be offline, got %s", result.Status)
	}
}

func TestProbeStatus_Offline503(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer upstream.Close()

	result, _ := probeStatusRequest(t, upstream.URL)
	if result.Status != "offline" {
		t.Errorf("503 should be offline, got %s", result.Status)
	}
}

func TestProbeStatus_Timeout(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second)
	}))
	defer upstream.Close()

	start := time.Now()
	result, _ := probeStatusRequest(t, upstream.URL)
	elapsed := time.Since(start)

	if result.Status != "offline" {
		t.Errorf("timeout should be offline, got %s", result.Status)
	}
	if elapsed > 4*time.Second {
		t.Errorf("probe took too long: %v", elapsed)
	}
}

func TestProbeStatus_UnreachableHost(t *testing.T) {
	result, _ := probeStatusRequest(t, "http://127.0.0.1:1")
	if result.Status != "offline" {
		t.Errorf("unreachable host should be offline, got %s", result.Status)
	}
}

func TestProbeStatus_EmptyURL(t *testing.T) {
	result, _ := probeStatusRequest(t, "")
	if result.Status != "unknown" {
		t.Errorf("empty URL should be unknown, got %s", result.Status)
	}
}

func TestProbeStatus_InvalidScheme(t *testing.T) {
	result, _ := probeStatusRequest(t, "ftp://example.com")
	if result.Status != "unknown" {
		t.Errorf("ftp scheme should be unknown, got %s", result.Status)
	}
}

func TestProbeStatus_ContentType(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	svc := &serviceItem{Name: "test-svc", URL: upstream.URL}
	req := httptest.NewRequest("GET", "/probe/test-svc/status", nil)
	rr := httptest.NewRecorder()
	handleProbeStatus(rr, req, svc)

	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected application/json, got %s", ct)
	}
}

func TestProbeStatus_RedirectFollowed(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/target" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.Redirect(w, r, "/target", http.StatusMovedPermanently)
	}))
	defer upstream.Close()

	result, _ := probeStatusRequest(t, upstream.URL)
	if result.Status != "online" {
		t.Errorf("redirect to 200 should be online, got %s", result.Status)
	}
}

func TestProbeStatus_Concurrent(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	var wg sync.WaitGroup
	errors := make(chan error, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result, _ := probeStatusRequest(t, upstream.URL)
			if result.Status != "online" {
				errors <- nil
			}
		}()
	}
	wg.Wait()
	close(errors)
	for range errors {
		t.Error("concurrent probe returned non-online status")
	}
}

// ─── systemStats tests ────────────────────────────────────────────────────────

func TestSystemStats_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("POST", "/system", nil)
	rr := httptest.NewRecorder()
	systemStats(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestSystemStats_ValidResponse(t *testing.T) {
	req := httptest.NewRequest("GET", "/system", nil)
	rr := httptest.NewRecorder()
	systemStats(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
	var info systemInfo
	if err := json.NewDecoder(rr.Body).Decode(&info); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if info.RAM.TotalMB < 0 {
		t.Errorf("negative total RAM: %d", info.RAM.TotalMB)
	}
	if info.RAM.Percent < 0 || info.RAM.Percent > 100 {
		t.Errorf("RAM percent out of range: %f", info.RAM.Percent)
	}
	if info.Disk.TotalGB < 0 {
		t.Errorf("negative total disk: %f", info.Disk.TotalGB)
	}
	if info.Disk.Percent < 0 || info.Disk.Percent > 100 {
		t.Errorf("disk percent out of range: %f", info.Disk.Percent)
	}
}

func TestSystemStats_ContentType(t *testing.T) {
	req := httptest.NewRequest("GET", "/system", nil)
	rr := httptest.NewRecorder()
	systemStats(rr, req)

	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected application/json, got %s", ct)
	}
}

// ─── CORS middleware tests ─────────────────────────────────────────────────────

func TestCORSMiddleware_Headers(t *testing.T) {
	handler := corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	req := httptest.NewRequest("GET", "/", nil)
	rr := httptest.NewRecorder()
	handler(rr, req)

	if rr.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Error("missing CORS Allow-Origin header")
	}
	if rr.Header().Get("Access-Control-Allow-Methods") == "" {
		t.Error("missing CORS Allow-Methods header")
	}
}

func TestCORSMiddleware_Options(t *testing.T) {
	handler := corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		t.Error("next handler should not be called on OPTIONS")
	})
	req := httptest.NewRequest("OPTIONS", "/", nil)
	rr := httptest.NewRecorder()
	handler(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Errorf("expected 204 for OPTIONS, got %d", rr.Code)
	}
}

// ─── handleManifest tests ──────────────────────────────────────────────────────

func TestHandleManifest_DefaultTitle(t *testing.T) {
	req := httptest.NewRequest("GET", "/manifest.json", nil)
	rr := httptest.NewRecorder()
	handleManifest(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	ct := rr.Header().Get("Content-Type")
	if ct != "application/manifest+json" {
		t.Errorf("expected application/manifest+json, got %s", ct)
	}

	var m map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&m); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	// When no config file exists in the test working directory, the handler
	// falls back to "Hive Dashboard". If a real config.yaml/config.json
	// exists in config-api/, this assertion may fail — run from a clean env.
	name, _ := m["name"].(string)
	if name != "Hive Dashboard" {
		t.Errorf("expected default title 'Hive Dashboard', got %q", name)
	}

	for _, field := range []string{"short_name", "start_url", "display", "theme_color", "background_color", "icons"} {
		if _, ok := m[field]; !ok {
			t.Errorf("manifest missing field: %s", field)
		}
	}

	if m["start_url"] != "/" {
		t.Errorf("start_url must be /, got %v", m["start_url"])
	}
	if m["display"] != "standalone" {
		t.Errorf("display must be standalone, got %v", m["display"])
	}
}

func TestHandleManifest_ShortNameCapped(t *testing.T) {
	req := httptest.NewRequest("GET", "/manifest.json", nil)
	rr := httptest.NewRecorder()
	handleManifest(rr, req)

	var m map[string]interface{}
	json.NewDecoder(rr.Body).Decode(&m)
	short, _ := m["short_name"].(string)
	if len([]rune(short)) > 12 {
		t.Errorf("short_name must be ≤ 12 runes, got %d: %q", len([]rune(short)), short)
	}
}

func TestHandleManifest_IconsPresent(t *testing.T) {
	req := httptest.NewRequest("GET", "/manifest.json", nil)
	rr := httptest.NewRecorder()
	handleManifest(rr, req)

	var m map[string]interface{}
	json.NewDecoder(rr.Body).Decode(&m)

	icons, ok := m["icons"].([]interface{})
	if !ok || len(icons) == 0 {
		t.Fatal("manifest must contain at least one icon")
	}
	for i, ic := range icons {
		icon, _ := ic.(map[string]interface{})
		if icon["src"] == nil || icon["sizes"] == nil {
			t.Errorf("icon %d missing src or sizes", i)
		}
	}
}
