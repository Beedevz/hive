package adapters

import (
	"fmt"
	"net/http"
)

// Overseerr/Jellyseerr adapter — requires API key (Settings → General).
// adapter_config: { apikey: "${OVERSEERR_APIKEY}" }
func fetchOverseerrStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	apikey := cfgStr(cfg, "apikey")
	if apikey == "" {
		return errResult("overseerr", "apikey not configured")
	}
	client := newHTTPClient(false)
	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("X-Api-Key", apikey)
		return doJSON(client, req, dest)
	}
	stats := []StatItem{}
	var status struct {
		Version string `json:"version"`
	}
	if err := do("/api/v1/status", &status); err != nil {
		return errResult("overseerr", "API unreachable: "+err.Error())
	}
	if status.Version != "" {
		stats = append(stats, StatItem{Label: "Version", Value: status.Version, Status: "info"})
	}
	var counts struct {
		Total     int `json:"total"`
		Pending   int `json:"pending"`
		Approved  int `json:"approved"`
		Available int `json:"available"`
		Declined  int `json:"declined"`
	}
	if err := do("/api/v1/request/count", &counts); err == nil {
		stats = append(stats, StatItem{Label: "Requests", Value: fmt.Sprintf("%d", counts.Total), Status: "info"})
		if counts.Pending > 0 {
			stats = append(stats, StatItem{Label: "Pending", Value: fmt.Sprintf("%d", counts.Pending), Status: "warn"})
		}
		if counts.Available > 0 {
			stats = append(stats, StatItem{Label: "Available", Value: fmt.Sprintf("%d", counts.Available), Status: "ok"})
		}
	}
	return AdapterResult{Adapter: "overseerr", Ok: true, Stats: stats}
}
