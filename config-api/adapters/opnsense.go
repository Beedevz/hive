package adapters

import (
	"net/http"
)

// OPNsense adapter — API key + secret (System → Access → Users → API keys).
// adapter_config: { apikey: "${OPNS_KEY}", apisecret: "${OPNS_SECRET}" }
func fetchOPNsenseStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	key := cfgStr(cfg, "apikey")
	secret := cfgStr(cfg, "apisecret")
	if key == "" || secret == "" {
		return errResult("opnsense", "apikey/apisecret not configured")
	}
	client := newHTTPClient(true) // self-signed cert common on OPNsense
	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.SetBasicAuth(key, secret)
		return doJSON(client, req, dest)
	}
	stats := []StatItem{}
	var firmware struct {
		Status  string `json:"status"`
		Version string `json:"product_version"`
	}
	if err := do("/api/core/firmware/running", &firmware); err != nil {
		var info struct {
			Product struct {
				Version string `json:"product_version"`
			} `json:"product"`
		}
		if err2 := do("/api/core/firmware/info", &info); err2 != nil {
			return errResult("opnsense", "API unreachable: "+err.Error())
		}
		stats = append(stats, StatItem{Label: "Version", Value: info.Product.Version, Status: "info"})
	} else if firmware.Version != "" {
		stats = append(stats, StatItem{Label: "Version", Value: firmware.Version, Status: "info"})
	}
	var gateways struct {
		Items []struct {
			Name   string `json:"name"`
			Status string `json:"status_translated"`
			Loss   string `json:"loss"`
			Delay  string `json:"delay"`
		} `json:"items"`
	}
	if err := do("/api/routes/gateway/status", &gateways); err == nil {
		for _, gw := range gateways.Items {
			gwStatus := "ok"
			if gw.Status != "Online" {
				gwStatus = "error"
			}
			stats = append(stats, StatItem{Label: "GW " + gw.Name, Value: gw.Status, Status: gwStatus})
		}
	}
	return AdapterResult{Adapter: "opnsense", Ok: true, Stats: stats}
}
