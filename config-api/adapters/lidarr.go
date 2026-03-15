package adapters

import (
	"fmt"
	"net/http"
)

// Lidarr adapter — requires API key (Settings → General → API Key).
// adapter_config: { apikey: "${LIDARR_APIKEY}" }
func fetchLidarrStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	apikey := cfgStr(cfg, "apikey")
	if apikey == "" {
		return errResult("lidarr", "apikey not configured")
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
	var artists []struct {
		ID int `json:"id"`
	}
	if err := do("/api/v1/artist", &artists); err != nil {
		return errResult("lidarr", "API unreachable: "+err.Error())
	}
	stats = append(stats, StatItem{Label: "Artists", Value: fmt.Sprintf("%d", len(artists)), Status: "info"})
	var queue struct {
		TotalRecords int `json:"totalRecords"`
	}
	if err := do("/api/v1/queue?pageSize=1", &queue); err == nil && queue.TotalRecords > 0 {
		stats = append(stats, StatItem{Label: "Queue", Value: fmt.Sprintf("%d", queue.TotalRecords), Status: "warn"})
	}
	var wanted struct {
		TotalRecords int `json:"totalRecords"`
	}
	if err := do("/api/v1/wanted/missing?pageSize=1", &wanted); err == nil {
		s := "ok"
		if wanted.TotalRecords > 0 {
			s = "warn"
		}
		stats = append(stats, StatItem{Label: "Missing", Value: fmt.Sprintf("%d", wanted.TotalRecords), Status: s})
	}
	return AdapterResult{Adapter: "lidarr", Ok: true, Stats: stats}
}
