package adapters

import (
	"fmt"
	"net/http"
)

// Prowlarr adapter — requires API key (Settings → General → API Key).
// adapter_config: { apikey: "${PROWLARR_APIKEY}" }
func fetchProwlarrStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	apikey := cfgStr(cfg, "apikey")
	if apikey == "" {
		return errResult("prowlarr", "apikey not configured")
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
	var indexers []struct {
		ID     int  `json:"id"`
		Enable bool `json:"enable"`
	}
	if err := do("/api/v1/indexer", &indexers); err != nil {
		return errResult("prowlarr", "API unreachable: "+err.Error())
	}
	enabled := 0
	for _, ix := range indexers {
		if ix.Enable {
			enabled++
		}
	}
	stats = append(stats, StatItem{Label: "Indexers", Value: fmt.Sprintf("%d / %d", enabled, len(indexers)), Status: "info"})
	var failing []struct {
		IndexerID int `json:"indexerId"`
	}
	if err := do("/api/v1/indexerstatus", &failing); err == nil {
		s := "ok"
		if len(failing) > 0 {
			s = "error"
		}
		stats = append(stats, StatItem{Label: "Failing", Value: fmt.Sprintf("%d", len(failing)), Status: s})
	}
	return AdapterResult{Adapter: "prowlarr", Ok: true, Stats: stats}
}
