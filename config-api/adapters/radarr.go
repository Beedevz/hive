package adapters

import (
	"fmt"
	"net/http"
)

// Radarr adapter — requires API key (Settings → General → API Key).
// adapter_config: { apikey: "${RADARR_APIKEY}" }
func fetchRadarrStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	apikey := cfgStr(cfg, "apikey")
	if apikey == "" {
		return errResult("radarr", "apikey not configured")
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

	var movies []struct{ ID int `json:"id"` }
	if err := do("/api/v3/movie", &movies); err != nil {
		return errResult("radarr", "API unreachable: "+err.Error())
	}
	stats = append(stats, StatItem{Label: "Movies", Value: fmt.Sprintf("%d", len(movies)), Status: "info"})

	var queue struct {
		TotalRecords int `json:"totalRecords"`
	}
	if err := do("/api/v3/queue?pageSize=1", &queue); err == nil && queue.TotalRecords > 0 {
		stats = append(stats, StatItem{Label: "Queue", Value: fmt.Sprintf("%d", queue.TotalRecords), Status: "warn"})
	}

	var missing []struct{ HasFile bool `json:"hasFile"` }
	if err := do("/api/v3/movie?monitored=true&hasFile=false", &missing); err == nil {
		missingStatus := "ok"
		if len(missing) > 0 {
			missingStatus = "warn"
		}
		stats = append(stats, StatItem{Label: "Missing", Value: fmt.Sprintf("%d", len(missing)), Status: missingStatus})
	}

	return AdapterResult{Adapter: "radarr", Ok: true, Stats: stats}
}
