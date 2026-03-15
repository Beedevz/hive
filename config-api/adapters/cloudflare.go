package adapters

import (
	"fmt"
	"net/http"
)

// Cloudflare Tunnels adapter — requires API token and Account ID.
// adapter_config: { apikey: "${CF_TOKEN}", accountid: "${CF_ACCOUNT_ID}" }
func fetchCloudflareTunnelStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	token := cfgStr(cfg, "apikey")
	accountID := cfgStr(cfg, "accountid")
	if token == "" || accountID == "" {
		return errResult("cloudflare", "apikey and accountid required")
	}
	client := newHTTPClient(false)
	req, err := http.NewRequest("GET", "https://api.cloudflare.com/client/v4/accounts/"+accountID+"/cfd_tunnel?is_deleted=false", nil)
	if err != nil {
		return errResult("cloudflare", "request error: "+err.Error())
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	var resp struct {
		Result []struct {
			Name   string `json:"name"`
			Status string `json:"status"`
		} `json:"result"`
		Success bool `json:"success"`
	}
	if err := doJSON(client, req, &resp); err != nil {
		return errResult("cloudflare", "API unreachable: "+err.Error())
	}
	if !resp.Success {
		return errResult("cloudflare", "API returned error")
	}
	active, inactive := 0, 0
	for _, t := range resp.Result {
		if t.Status == "healthy" {
			active++
		} else {
			inactive++
		}
	}
	stats := []StatItem{}
	status := "ok"
	if inactive > 0 {
		status = "warn"
	}
	stats = append(stats, StatItem{Label: "Tunnels", Value: fmt.Sprintf("%d active", active), Status: status})
	if inactive > 0 {
		stats = append(stats, StatItem{Label: "Inactive", Value: fmt.Sprintf("%d", inactive), Status: "warn"})
	}
	return AdapterResult{Adapter: "cloudflare", Ok: true, Stats: stats}
}
