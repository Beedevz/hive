package adapters

import (
	"net/http"
)

// Bazarr adapter — requires API key (Settings → General → API Key).
// adapter_config: { apikey: "${BAZARR_APIKEY}" }
func fetchBazarrStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	apikey := cfgStr(cfg, "apikey")
	if apikey == "" {
		return errResult("bazarr", "apikey not configured")
	}
	client := newHTTPClient(false)
	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("X-API-KEY", apikey)
		return doJSON(client, req, dest)
	}
	stats := []StatItem{}
	var status struct {
		Data struct {
			BazarrVersion string `json:"bazarr_version"`
		} `json:"data"`
	}
	if err := do("/api/system/status", &status); err != nil {
		return errResult("bazarr", "API unreachable: "+err.Error())
	}
	if v := status.Data.BazarrVersion; v != "" {
		stats = append(stats, StatItem{Label: "Version", Value: v, Status: "info"})
	}
	var episodes struct {
		Total int `json:"total"`
	}
	if err := do("/api/episodes?start=0&length=1", &episodes); err == nil {
		stats = append(stats, StatItem{Label: "Episodes", Value: formatCount(episodes.Total), Status: "info"})
	}
	var movies struct {
		Total int `json:"total"`
	}
	if err := do("/api/movies?start=0&length=1", &movies); err == nil {
		stats = append(stats, StatItem{Label: "Movies", Value: formatCount(movies.Total), Status: "info"})
	}
	return AdapterResult{Adapter: "bazarr", Ok: true, Stats: stats}
}
