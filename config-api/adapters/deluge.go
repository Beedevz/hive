package adapters

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// Deluge adapter — password auth (Web UI password).
// adapter_config: { password: "${DELUGE_PASS}" }
func fetchDelugeStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	password := cfgStr(cfg, "password")
	if password == "" {
		return errResult("deluge", "password not configured")
	}
	jar := &simpleCookieJar{}
	client := &http.Client{
		Timeout:   5 * 1e9,
		Transport: newHTTPClient(false).Transport,
		Jar:       jar,
	}
	rpcURL := baseURL + "/json"

	call := func(method string, params interface{}, dest interface{}) error {
		body, _ := json.Marshal(map[string]interface{}{"method": method, "params": params, "id": 1})
		req, err := http.NewRequest("POST", rpcURL, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		var wrapper struct {
			Result json.RawMessage `json:"result"`
			Error  interface{}     `json:"error"`
		}
		if err := json.Unmarshal(b, &wrapper); err != nil {
			return err
		}
		if wrapper.Result == nil {
			return fmt.Errorf("no result")
		}
		if dest != nil {
			return json.Unmarshal(wrapper.Result, dest)
		}
		return nil
	}

	var loginOk bool
	if err := call("auth.login", []interface{}{password}, &loginOk); err != nil || !loginOk {
		return errResult("deluge", "authentication failed")
	}

	stats := []StatItem{}
	var sessionStatus struct {
		PayloadDownloadRate float64 `json:"payload_download_rate"`
		PayloadUploadRate   float64 `json:"payload_upload_rate"`
	}
	if err := call("core.get_session_status", []interface{}{[]string{"payload_download_rate", "payload_upload_rate"}}, &sessionStatus); err == nil {
		stats = append(stats, StatItem{Label: "↓", Value: formatSpeed(int64(sessionStatus.PayloadDownloadRate)), Status: "info"})
		stats = append(stats, StatItem{Label: "↑", Value: formatSpeed(int64(sessionStatus.PayloadUploadRate)), Status: "info"})
	}

	var torrents map[string]struct {
		State string `json:"state"`
	}
	if err := call("core.get_torrents_status", []interface{}{map[string]interface{}{}, []string{"state"}}, &torrents); err == nil {
		downloading, seeding, paused := 0, 0, 0
		for _, t := range torrents {
			switch t.State {
			case "Downloading":
				downloading++
			case "Seeding":
				seeding++
			case "Paused":
				paused++
			}
		}
		stats = append(stats, StatItem{Label: "Seeding", Value: fmt.Sprintf("%d", seeding), Status: "ok"})
		if downloading > 0 {
			stats = append(stats, StatItem{Label: "Downloading", Value: fmt.Sprintf("%d", downloading), Status: "warn"})
		}
		if paused > 0 {
			stats = append(stats, StatItem{Label: "Paused", Value: fmt.Sprintf("%d", paused), Status: "info"})
		}
	}
	return AdapterResult{Adapter: "deluge", Ok: true, Stats: stats}
}
