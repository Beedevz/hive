package adapters

import (
	"fmt"
	"net/http"
)

// Tailscale adapter — requires API key and tailnet name.
// adapter_config: { apikey: "${TS_APIKEY}", tailnet: "${TS_TAILNET}" }
func fetchTailscaleStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	apikey := cfgStr(cfg, "apikey")
	tailnet := cfgStr(cfg, "tailnet")
	if apikey == "" || tailnet == "" {
		return errResult("tailscale", "apikey and tailnet required")
	}
	client := newHTTPClient(false)
	req, err := http.NewRequest("GET", "https://api.tailscale.com/api/v2/tailnet/"+tailnet+"/devices", nil)
	if err != nil {
		return errResult("tailscale", "request error: "+err.Error())
	}
	req.SetBasicAuth(apikey, "")
	var resp struct {
		Devices []struct {
			Hostname string `json:"hostname"`
			OS       string `json:"os"`
		} `json:"devices"`
	}
	if err := doJSON(client, req, &resp); err != nil {
		return errResult("tailscale", "API unreachable: "+err.Error())
	}
	total := len(resp.Devices)
	stats := []StatItem{
		{Label: "Devices", Value: fmt.Sprintf("%d", total), Status: "info"},
	}
	return AdapterResult{Adapter: "tailscale", Ok: true, Stats: stats}
}
