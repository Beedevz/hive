package adapters

import (
	"fmt"
	"net/http"
)

// Readarr adapter — requires API key (Settings → General → API Key).
// adapter_config: { apikey: "${READARR_APIKEY}" }
func fetchReadarrStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	apikey := cfgStr(cfg, "apikey")
	if apikey == "" {
		return errResult("readarr", "apikey not configured")
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
	var books []struct {
		ID int `json:"id"`
	}
	if err := do("/api/v1/book", &books); err != nil {
		return errResult("readarr", "API unreachable: "+err.Error())
	}
	stats = append(stats, StatItem{Label: "Books", Value: fmt.Sprintf("%d", len(books)), Status: "info"})
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
	return AdapterResult{Adapter: "readarr", Ok: true, Stats: stats}
}
