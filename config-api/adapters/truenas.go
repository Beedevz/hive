package adapters

import (
	"fmt"
	"net/http"
)

// TrueNAS adapter — requires API key (Credentials → API Keys).
// adapter_config: { apikey: "${TRUENAS_APIKEY}" }
func fetchTrueNASStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	apikey := cfgStr(cfg, "apikey")
	if apikey == "" {
		return errResult("truenas", "apikey not configured")
	}
	client := newHTTPClient(true) // self-signed cert common on TrueNAS
	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+apikey)
		return doJSON(client, req, dest)
	}
	stats := []StatItem{}
	var info struct {
		Version string `json:"version"`
	}
	if err := do("/api/v2.0/system/info", &info); err != nil {
		return errResult("truenas", "API unreachable: "+err.Error())
	}
	if info.Version != "" {
		stats = append(stats, StatItem{Label: "Version", Value: info.Version, Status: "info"})
	}
	var pools []struct {
		Name    string `json:"name"`
		Status  string `json:"status"`
		Healthy bool   `json:"healthy"`
	}
	if err := do("/api/v2.0/pool", &pools); err == nil {
		for _, p := range pools {
			poolStatus := "ok"
			if !p.Healthy {
				poolStatus = "error"
			} else if p.Status != "ONLINE" {
				poolStatus = "warn"
			}
			stats = append(stats, StatItem{Label: p.Name, Value: p.Status, Status: poolStatus})
		}
	}
	var disks []struct {
		Name string `json:"name"`
	}
	if err := do("/api/v2.0/disk", &disks); err == nil {
		stats = append(stats, StatItem{Label: "Disks", Value: fmt.Sprintf("%d", len(disks)), Status: "info"})
	}
	return AdapterResult{Adapter: "truenas", Ok: true, Stats: stats}
}
