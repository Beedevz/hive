package adapters

import (
	"fmt"
	"net/http"
)

// Scrutiny adapter — no auth required by default.
// adapter_config: {}
func fetchScrutinyStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	client := newHTTPClient(false)
	req, err := http.NewRequest("GET", baseURL+"/api/summary", nil)
	if err != nil {
		return errResult("scrutiny", "request error: "+err.Error())
	}
	var resp struct {
		Data struct {
			Summary map[string]struct {
				Device struct {
					DeviceName string `json:"device_name"`
					DeviceType string `json:"device_type"`
				} `json:"device"`
				SmartResults []struct {
					Status int `json:"Status"`
				} `json:"smart_results"`
			} `json:"summary"`
		} `json:"data"`
	}
	if err := doJSON(client, req, &resp); err != nil {
		return errResult("scrutiny", "API unreachable: "+err.Error())
	}
	total, failed, warn := 0, 0, 0
	for _, d := range resp.Data.Summary {
		total++
		if len(d.SmartResults) > 0 {
			switch d.SmartResults[0].Status {
			case 2:
				failed++
			case 1:
				warn++
			}
		}
	}
	stats := []StatItem{}
	diskStatus := "ok"
	if failed > 0 {
		diskStatus = "error"
	} else if warn > 0 {
		diskStatus = "warn"
	}
	stats = append(stats, StatItem{Label: "Disks", Value: fmt.Sprintf("%d total", total), Status: "info"})
	if failed > 0 {
		stats = append(stats, StatItem{Label: "Failed", Value: fmt.Sprintf("%d", failed), Status: "error"})
	} else if warn > 0 {
		stats = append(stats, StatItem{Label: "Warning", Value: fmt.Sprintf("%d", warn), Status: "warn"})
	} else {
		stats = append(stats, StatItem{Label: "Health", Value: "all passing", Status: diskStatus})
	}
	return AdapterResult{Adapter: "scrutiny", Ok: true, Stats: stats}
}
