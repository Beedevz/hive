package adapters

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// Transmission adapter — optional username/password.
// adapter_config: { username: "${TR_USER}", password: "${TR_PASS}" }
func fetchTransmissionStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	user := cfgStr(cfg, "username")
	pass := cfgStr(cfg, "password")
	client := newHTTPClient(false)
	rpcURL := baseURL + "/transmission/rpc"

	// Get session ID (Transmission returns 409 with X-Transmission-Session-Id on first request)
	probe, _ := http.NewRequest("POST", rpcURL, bytes.NewReader([]byte(`{"method":"session-get"}`)))
	probe.Header.Set("Content-Type", "application/json")
	if user != "" {
		probe.SetBasicAuth(user, pass)
	}
	probeResp, err := client.Do(probe)
	if err != nil {
		return errResult("transmission", "API unreachable: "+err.Error())
	}
	probeResp.Body.Close()

	sid := probeResp.Header.Get("X-Transmission-Session-Id")
	// If 409, the header has the session ID
	if probeResp.StatusCode == 409 {
		sid = probeResp.Header.Get("X-Transmission-Session-Id")
	}

	rpc := func(method string, dest interface{}) error {
		body, _ := json.Marshal(map[string]interface{}{"method": method})
		req, err := http.NewRequest("POST", rpcURL, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Transmission-Session-Id", sid)
		if user != "" {
			req.SetBasicAuth(user, pass)
		}
		resp, err := client.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		var wrapper struct {
			Arguments json.RawMessage `json:"arguments"`
		}
		if err := json.Unmarshal(b, &wrapper); err != nil {
			return err
		}
		return json.Unmarshal(wrapper.Arguments, dest)
	}

	stats := []StatItem{}
	var sessionStats struct {
		ActiveTorrentCount int   `json:"activeTorrentCount"`
		PausedTorrentCount int   `json:"pausedTorrentCount"`
		DownloadSpeed      int64 `json:"downloadSpeed"`
		UploadSpeed        int64 `json:"uploadSpeed"`
	}
	if err := rpc("session-stats", &sessionStats); err != nil {
		return errResult("transmission", "RPC failed: "+err.Error())
	}
	total := sessionStats.ActiveTorrentCount + sessionStats.PausedTorrentCount
	stats = append(stats, StatItem{Label: "Torrents", Value: fmt.Sprintf("%d active / %d total", sessionStats.ActiveTorrentCount, total), Status: "info"})
	if sessionStats.DownloadSpeed > 0 {
		stats = append(stats, StatItem{Label: "↓", Value: formatSpeed(sessionStats.DownloadSpeed), Status: "info"})
	}
	if sessionStats.UploadSpeed > 0 {
		stats = append(stats, StatItem{Label: "↑", Value: formatSpeed(sessionStats.UploadSpeed), Status: "info"})
	}
	return AdapterResult{Adapter: "transmission", Ok: true, Stats: stats}
}
