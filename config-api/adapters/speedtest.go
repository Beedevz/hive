package adapters

import (
	"fmt"
	"net/http"
)

// Speedtest Tracker adapter — no auth required by default.
// adapter_config: {}
func fetchSpeedtestStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	client := newHTTPClient(false)
	req, err := http.NewRequest("GET", baseURL+"/api/v1/results/latest", nil)
	if err != nil {
		return errResult("speedtest", "request error: "+err.Error())
	}
	var resp struct {
		Data struct {
			Download float64 `json:"download"`
			Upload   float64 `json:"upload"`
			Ping     float64 `json:"ping"`
		} `json:"data"`
	}
	if err := doJSON(client, req, &resp); err != nil {
		return errResult("speedtest", "API unreachable: "+err.Error())
	}
	d := resp.Data
	stats := []StatItem{
		{Label: "↓", Value: fmt.Sprintf("%.1f Mbps", d.Download), Status: "info"},
		{Label: "↑", Value: fmt.Sprintf("%.1f Mbps", d.Upload), Status: "info"},
		{Label: "Ping", Value: fmt.Sprintf("%.0f ms", d.Ping), Status: "info"},
	}
	return AdapterResult{Adapter: "speedtest", Ok: true, Stats: stats}
}
