package adapters

import (
	"fmt"
	"math"
	"net/http"
)

// AdGuard Home adapter — Basic Auth (username + password).
// adapter_config: { username: "${ADGUARD_USER}", password: "${ADGUARD_PASS}" }
func fetchAdGuardStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	user := cfgStr(cfg, "username")
	pass := cfgStr(cfg, "password")
	if user == "" || pass == "" {
		return errResult("adguard", "username/password not configured")
	}

	client := newHTTPClient(false)

	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.SetBasicAuth(user, pass)
		return doJSON(client, req, dest)
	}

	var statsData struct {
		NumDNSQueries       int     `json:"num_dns_queries"`
		NumBlockedFiltering int     `json:"num_blocked_filtering"`
		NumClients          int     `json:"num_clients"`
		AvgProcessingTime   float64 `json:"avg_processing_time"`
	}
	if err := do("/control/stats", &statsData); err != nil {
		return errResult("adguard", "API unreachable: "+err.Error())
	}

	stats := []StatItem{}

	queryVal := fmt.Sprintf("%d", statsData.NumDNSQueries)
	if statsData.NumDNSQueries >= 1000 {
		queryVal = fmt.Sprintf("%.1fk", float64(statsData.NumDNSQueries)/1000)
	}
	stats = append(stats, StatItem{Label: "Queries", Value: queryVal + "/day", Status: "info"})

	if statsData.NumDNSQueries > 0 {
		blockedPct := math.Round(float64(statsData.NumBlockedFiltering)/float64(statsData.NumDNSQueries)*1000) / 10
		blockStatus := "ok"
		if blockedPct > 40 {
			blockStatus = "warn"
		}
		stats = append(stats, StatItem{Label: "Blocked", Value: fmt.Sprintf("%.1f%%", blockedPct), Status: blockStatus})
	}

	if statsData.NumClients > 0 {
		stats = append(stats, StatItem{Label: "Clients", Value: fmt.Sprintf("%d", statsData.NumClients), Status: "info"})
	}

	return AdapterResult{Adapter: "adguard", Ok: true, Stats: stats}
}
