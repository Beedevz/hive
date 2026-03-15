package adapters

import (
	"fmt"
	"net/http"
)

// Sonarr adapter — requires API key (Settings → General → API Key).
// adapter_config: { apikey: "${SONARR_APIKEY}" }
func fetchSonarrStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	apikey := cfgStr(cfg, "apikey")
	if apikey == "" {
		return errResult("sonarr", "apikey not configured")
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

	var series []struct{ ID int `json:"id"` }
	if err := do("/api/v3/series", &series); err != nil {
		return errResult("sonarr", "API unreachable: "+err.Error())
	}
	stats = append(stats, StatItem{Label: "Series", Value: fmt.Sprintf("%d", len(series)), Status: "info"})

	var queue struct {
		TotalRecords int `json:"totalRecords"`
	}
	if err := do("/api/v3/queue?pageSize=1", &queue); err == nil && queue.TotalRecords > 0 {
		stats = append(stats, StatItem{Label: "Queue", Value: fmt.Sprintf("%d", queue.TotalRecords), Status: "warn"})
	}

	var wanted struct {
		TotalRecords int `json:"totalRecords"`
	}
	if err := do("/api/v3/wanted/missing?pageSize=1", &wanted); err == nil {
		wantedStatus := "ok"
		if wanted.TotalRecords > 0 {
			wantedStatus = "warn"
		}
		stats = append(stats, StatItem{Label: "Missing", Value: fmt.Sprintf("%d", wanted.TotalRecords), Status: wantedStatus})
	}

	return AdapterResult{Adapter: "sonarr", Ok: true, Stats: stats}
}
