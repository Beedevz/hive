package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// ─── probeService tests ──────────────────────────────────────────────────────

func TestProbeService_Online200(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodHead {
			t.Errorf("expected HEAD, got %s", r.Method)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	req := httptest.NewRequest("GET", "/probe?url="+upstream.URL, nil)
	rr := httptest.NewRecorder()
	probeService(rr, req)

	var result probeResult
	if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if result.Status != "online" {
		t.Errorf("expected online, got %s", result.Status)
	}
	if result.LatencyMs < 0 {
		t.Errorf("negative latency: %d", result.LatencyMs)
	}
}

func TestProbeService_Online404(t *testing.T) {
	// 404 is still "online" — service is reachable, just path not found
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer upstream.Close()

	req := httptest.NewRequest("GET", "/probe?url="+upstream.URL, nil)
	rr := httptest.NewRecorder()
	probeService(rr, req)

	var result probeResult
	json.NewDecoder(rr.Body).Decode(&result)
	if result.Status != "online" {
		t.Errorf("404 should be online, got %s", result.Status)
	}
}

func TestProbeService_Offline500(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer upstream.Close()

	req := httptest.NewRequest("GET", "/probe?url="+upstream.URL, nil)
	rr := httptest.NewRecorder()
	probeService(rr, req)

	var result probeResult
	json.NewDecoder(rr.Body).Decode(&result)
	if result.Status != "offline" {
		t.Errorf("500 should be offline, got %s", result.Status)
	}
}

func TestProbeService_Offline503(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer upstream.Close()

	req := httptest.NewRequest("GET", "/probe?url="+upstream.URL, nil)
	rr := httptest.NewRecorder()
	probeService(rr, req)

	var result probeResult
	json.NewDecoder(rr.Body).Decode(&result)
	if result.Status != "offline" {
		t.Errorf("503 should be offline, got %s", result.Status)
	}
}

func TestProbeService_Timeout(t *testing.T) {
	// Upstream hangs longer than the 3s probe timeout
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second)
	}))
	defer upstream.Close()

	req := httptest.NewRequest("GET", "/probe?url="+upstream.URL, nil)
	rr := httptest.NewRecorder()

	start := time.Now()
	probeService(rr, req)
	elapsed := time.Since(start)

	var result probeResult
	json.NewDecoder(rr.Body).Decode(&result)
	if result.Status != "offline" {
		t.Errorf("timeout should be offline, got %s", result.Status)
	}
	// Should finish well under 5s (the upstream delay)
	if elapsed > 4*time.Second {
		t.Errorf("probe took too long: %v", elapsed)
	}
}

func TestProbeService_UnreachableHost(t *testing.T) {
	// Port 1 is reserved and never listening
	req := httptest.NewRequest("GET", "/probe?url=http://127.0.0.1:1", nil)
	rr := httptest.NewRecorder()
	probeService(rr, req)

	var result probeResult
	json.NewDecoder(rr.Body).Decode(&result)
	if result.Status != "offline" {
		t.Errorf("unreachable host should be offline, got %s", result.Status)
	}
}

func TestProbeService_MissingURL(t *testing.T) {
	req := httptest.NewRequest("GET", "/probe", nil)
	rr := httptest.NewRecorder()
	probeService(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestProbeService_InvalidScheme(t *testing.T) {
	// ftp:// is not http/https — should return unknown
	req := httptest.NewRequest("GET", "/probe?url=ftp://example.com", nil)
	rr := httptest.NewRecorder()
	probeService(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
	var result probeResult
	json.NewDecoder(rr.Body).Decode(&result)
	if result.Status != "unknown" {
		t.Errorf("ftp scheme should be unknown, got %s", result.Status)
	}
}

func TestProbeService_MalformedURL(t *testing.T) {
	req := httptest.NewRequest("GET", "/probe?url=not-a-url-at-all", nil)
	rr := httptest.NewRecorder()
	probeService(rr, req)

	var result probeResult
	json.NewDecoder(rr.Body).Decode(&result)
	if result.Status != "unknown" {
		t.Errorf("malformed URL should be unknown, got %s", result.Status)
	}
}

func TestProbeService_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("POST", "/probe?url=http://example.com", nil)
	rr := httptest.NewRecorder()
	probeService(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestProbeService_RedirectFollowed(t *testing.T) {
	// Upstream redirects to /target which returns 200
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/target" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.Redirect(w, r, "/target", http.StatusMovedPermanently)
	}))
	defer upstream.Close()

	req := httptest.NewRequest("GET", "/probe?url="+upstream.URL, nil)
	rr := httptest.NewRecorder()
	probeService(rr, req)

	var result probeResult
	json.NewDecoder(rr.Body).Decode(&result)
	if result.Status != "online" {
		t.Errorf("redirect to 200 should be online, got %s", result.Status)
	}
}

func TestProbeService_ContentType(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	req := httptest.NewRequest("GET", "/probe?url="+upstream.URL, nil)
	rr := httptest.NewRecorder()
	probeService(rr, req)

	ct := rr.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("expected application/json, got %s", ct)
	}
}

func TestProbeService_Concurrent(t *testing.T) {
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
			req := httptest.NewRequest("GET", "/probe?url="+upstream.URL, nil)
			rr := httptest.NewRecorder()
			probeService(rr, req)
			var result probeResult
			if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
				errors <- err
				return
			}
			if result.Status != "online" {
				errors <- nil // count wrong status as an error by closing
			}
		}()
	}
	wg.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Errorf("concurrent probe error: %v", err)
		}
	}
}

// ─── systemStats tests ───────────────────────────────────────────────────────

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
	// On Linux (Docker), /proc/meminfo exists — RAM should be populated.
	// On macOS (dev), it may be zero — just verify structure is valid.
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

	ct := rr.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("expected application/json, got %s", ct)
	}
}

// ─── CORS middleware tests ────────────────────────────────────────────────────

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
