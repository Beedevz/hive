package adapters

import (
	"net/http"
)

// Vaultwarden adapter — uses public config endpoint, no auth required.
// adapter_config: {}
func fetchVaultwardenStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	client := newHTTPClient(false)

	req, err := http.NewRequest("GET", baseURL+"/api/config", nil)
	if err != nil {
		return errResult("vaultwarden", "request error: "+err.Error())
	}
	req.Header.Set("Accept", "application/json")

	var config struct {
		Version string `json:"version"`
	}
	if err := doJSON(client, req, &config); err != nil {
		return errResult("vaultwarden", "API unreachable: "+err.Error())
	}

	stats := []StatItem{}
	if config.Version != "" {
		stats = append(stats, StatItem{Label: "Version", Value: config.Version, Status: "info"})
	}
	stats = append(stats, StatItem{Label: "Status", Value: "healthy", Status: "ok"})

	return AdapterResult{Adapter: "vaultwarden", Ok: true, Stats: stats}
}
