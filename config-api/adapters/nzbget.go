package adapters

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

// NZBget adapter — username/password basic auth.
// adapter_config: { username: "${NZBGET_USER}", password: "${NZBGET_PASS}" }
func fetchNZBgetStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	user := cfgStr(cfg, "username")
	pass := cfgStr(cfg, "password")
	if user == "" {
		return errResult("nzbget", "username not configured")
	}
	client := newHTTPClient(false)
	body, _ := json.Marshal(map[string]interface{}{"method": "status", "id": 1, "params": []interface{}{}})
	req, err := http.NewRequest("POST", baseURL+"/jsonrpc", bytes.NewReader(body))
	if err != nil {
		return errResult("nzbget", "request error: "+err.Error())
	}
	req.Header.Set("Content-Type", "application/json")
	if user != "" {
		req.SetBasicAuth(user, pass)
	}
	var resp struct {
		Result struct {
			DownloadRate    int64   `json:"DownloadRate"`
			RemainingSizeMB float64 `json:"RemainingSizeMB"`
			DownloadPaused  bool    `json:"DownloadPaused"`
			ThreadCount     int     `json:"ThreadCount"`
		} `json:"result"`
	}
	if err := doJSON(client, req, &resp); err != nil {
		return errResult("nzbget", "API unreachable: "+err.Error())
	}
	r := resp.Result
	stats := []StatItem{}
	statusVal, statusColor := "downloading", "ok"
	if r.DownloadPaused {
		statusVal, statusColor = "paused", "warn"
	}
	stats = append(stats, StatItem{Label: "Status", Value: statusVal, Status: statusColor})
	if r.DownloadRate > 0 {
		stats = append(stats, StatItem{Label: "Speed", Value: formatSpeed(r.DownloadRate), Status: "info"})
	}
	if r.RemainingSizeMB > 0 {
		stats = append(stats, StatItem{Label: "Remaining", Value: fmt.Sprintf("%.1f MB", r.RemainingSizeMB), Status: "info"})
	}
	return AdapterResult{Adapter: "nzbget", Ok: true, Stats: stats}
}
