package adapters

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
)

// Watchtower adapter — requires HTTP API token.
// adapter_config: { token: "${WATCHTOWER_TOKEN}" }
func fetchWatchtowerStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	token := cfgStr(cfg, "token")
	if token == "" {
		return errResult("watchtower", "token not configured")
	}
	client := newHTTPClient(false)
	req, err := http.NewRequest("GET", baseURL+"/v1/metrics", nil)
	if err != nil {
		return errResult("watchtower", "request error: "+err.Error())
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := client.Do(req)
	if err != nil {
		return errResult("watchtower", "API unreachable: "+err.Error())
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	metrics := parsePrometheusMetrics(string(body))
	stats := []StatItem{}
	if v, ok := metrics["watchtower_containers_updated_total"]; ok {
		stats = append(stats, StatItem{Label: "Updated", Value: fmt.Sprintf("%.0f total", v), Status: "info"})
	}
	if v, ok := metrics["watchtower_containers_scanned_total"]; ok {
		stats = append(stats, StatItem{Label: "Scanned", Value: fmt.Sprintf("%.0f", v), Status: "info"})
	}
	if v, ok := metrics["watchtower_containers_failed_total"]; ok && v > 0 {
		stats = append(stats, StatItem{Label: "Failed", Value: fmt.Sprintf("%.0f", v), Status: "error"})
	}
	if len(stats) == 0 {
		stats = append(stats, StatItem{Label: "Status", Value: "running", Status: "ok"})
	}
	return AdapterResult{Adapter: "watchtower", Ok: true, Stats: stats}
}

// parsePrometheusMetrics parses simple Prometheus text format into key→value map.
func parsePrometheusMetrics(text string) map[string]float64 {
	m := map[string]float64{}
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "#") || line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) >= 2 {
			key := parts[0]
			if idx := strings.Index(key, "{"); idx != -1 {
				key = key[:idx]
			}
			if v, err := strconv.ParseFloat(parts[1], 64); err == nil {
				m[key] += v
			}
		}
	}
	return m
}
