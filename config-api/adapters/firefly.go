package adapters

import (
	"fmt"
	"net/http"
	"time"
)

// Firefly III adapter — requires Personal Access Token.
// adapter_config: { token: "${FIREFLY_TOKEN}" }
func fetchFireflyStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	token := cfgStr(cfg, "token")
	if token == "" {
		return errResult("firefly", "token not configured")
	}
	client := newHTTPClient(false)
	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Accept", "application/vnd.api+json")
		return doJSON(client, req, dest)
	}
	stats := []StatItem{}
	var about struct {
		Data struct {
			Version string `json:"version"`
		} `json:"data"`
	}
	if err := do("/api/v1/about", &about); err != nil {
		return errResult("firefly", "API unreachable: "+err.Error())
	}
	if about.Data.Version != "" {
		stats = append(stats, StatItem{Label: "Version", Value: about.Data.Version, Status: "info"})
	}
	var accounts []struct {
		ID string `json:"id"`
	}
	if err := do("/api/v1/accounts?type=asset", &accounts); err == nil {
		stats = append(stats, StatItem{Label: "Accounts", Value: fmt.Sprintf("%d", len(accounts)), Status: "info"})
	}
	// Bills due this month
	now := time.Now()
	start := fmt.Sprintf("%d-%02d-01", now.Year(), now.Month())
	end := fmt.Sprintf("%d-%02d-%02d", now.Year(), now.Month(), daysInMonth(now))
	var bills struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := do("/api/v1/bills?start="+start+"&end="+end, &bills); err == nil {
		stats = append(stats, StatItem{Label: "Bills", Value: fmt.Sprintf("%d this month", len(bills.Data)), Status: "info"})
	}
	return AdapterResult{Adapter: "firefly", Ok: true, Stats: stats}
}

func daysInMonth(t time.Time) int {
	return time.Date(t.Year(), t.Month()+1, 0, 0, 0, 0, 0, t.Location()).Day()
}
