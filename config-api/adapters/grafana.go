package adapters

import (
	"fmt"
	"net/http"
)

// Grafana adapter — Service Account token or API key.
// adapter_config: { token: "${GRAFANA_TOKEN}" }
func fetchGrafanaStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	token := cfgStr(cfg, "token")
	if token == "" {
		return errResult("grafana", "token not configured")
	}

	client := newHTTPClient(false)

	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		return doJSON(client, req, dest)
	}

	stats := []StatItem{}

	var dashboards []struct{ ID int `json:"id"` }
	if err := do("/api/search?type=dash-db&limit=500", &dashboards); err != nil {
		return errResult("grafana", "API unreachable: "+err.Error())
	}
	stats = append(stats, StatItem{Label: "Dashboards", Value: fmt.Sprintf("%d", len(dashboards)), Status: "info"})

	var datasources []struct{ ID int `json:"id"` }
	if err := do("/api/datasources", &datasources); err == nil {
		stats = append(stats, StatItem{Label: "Datasources", Value: fmt.Sprintf("%d", len(datasources)), Status: "info"})
	}

	var alerts []struct {
		Status struct{ State string `json:"state"` } `json:"status"`
	}
	if err := do("/api/alerts?state=alerting&limit=100", &alerts); err == nil {
		alertStatus := "ok"
		if len(alerts) > 0 {
			alertStatus = "error"
		}
		stats = append(stats, StatItem{Label: "Alerts", Value: fmt.Sprintf("%d firing", len(alerts)), Status: alertStatus})
	}

	return AdapterResult{Adapter: "grafana", Ok: true, Stats: stats}
}
