package adapters

import (
	"fmt"
	"net/http"
)

// Paperless-ngx adapter — requires API token (profile page).
// adapter_config: { token: "${PAPERLESS_TOKEN}" }
func fetchPaperlessStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	token := cfgStr(cfg, "token")
	if token == "" {
		return errResult("paperless", "token not configured")
	}
	client := newHTTPClient(false)
	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Token "+token)
		return doJSON(client, req, dest)
	}
	stats := []StatItem{}
	var docs struct {
		Count int `json:"count"`
	}
	if err := do("/api/documents/?page_size=1", &docs); err != nil {
		return errResult("paperless", "API unreachable: "+err.Error())
	}
	stats = append(stats, StatItem{Label: "Documents", Value: formatCount(docs.Count), Status: "info"})
	var corr struct {
		Count int `json:"count"`
	}
	if err := do("/api/correspondent/?page_size=1", &corr); err == nil {
		stats = append(stats, StatItem{Label: "Correspondents", Value: fmt.Sprintf("%d", corr.Count), Status: "info"})
	}
	var tags struct {
		Count int `json:"count"`
	}
	if err := do("/api/tag/?page_size=1", &tags); err == nil {
		stats = append(stats, StatItem{Label: "Tags", Value: fmt.Sprintf("%d", tags.Count), Status: "info"})
	}
	return AdapterResult{Adapter: "paperless", Ok: true, Stats: stats}
}
