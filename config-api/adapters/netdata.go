package adapters

import (
	"fmt"
	"net/http"
)

// Netdata adapter — no auth required by default.
// adapter_config: {}
func fetchNetdataStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	client := newHTTPClient(false)

	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		return doJSON(client, req, dest)
	}

	stats := []StatItem{}

	// Server info + alarms
	var serverStats struct {
		Version string `json:"netdata_version"`
		Alarms  struct {
			Critical int `json:"critical"`
			Warning  int `json:"warning"`
		} `json:"alarms"`
	}
	if err := do("/api/v1/server_stats", &serverStats); err != nil {
		return errResult("netdata", "API unreachable: "+err.Error())
	}
	if serverStats.Version != "" {
		stats = append(stats, StatItem{Label: "Version", Value: serverStats.Version, Status: "info"})
	}

	alarmStatus := "ok"
	if serverStats.Alarms.Critical > 0 {
		alarmStatus = "error"
	} else if serverStats.Alarms.Warning > 0 {
		alarmStatus = "warn"
	}
	alarmVal := "none"
	if serverStats.Alarms.Critical+serverStats.Alarms.Warning > 0 {
		alarmVal = fmt.Sprintf("%d critical, %d warn", serverStats.Alarms.Critical, serverStats.Alarms.Warning)
	}
	stats = append(stats, StatItem{Label: "Alarms", Value: alarmVal, Status: alarmStatus})

	// CPU usage (last 60s average)
	var cpuData struct {
		Data [][]float64 `json:"data"`
	}
	if err := do("/api/v1/data?chart=system.cpu&after=-60&points=1&group=average&format=json", &cpuData); err == nil {
		if len(cpuData.Data) > 0 && len(cpuData.Data[0]) > 1 {
			total := 0.0
			for _, v := range cpuData.Data[0][1:] { // skip timestamp
				total += v
			}
			cpuStatus := "ok"
			if total > 80 {
				cpuStatus = "error"
			} else if total > 60 {
				cpuStatus = "warn"
			}
			stats = append(stats, StatItem{Label: "CPU", Value: fmt.Sprintf("%.1f%%", total), Status: cpuStatus})
		}
	}

	return AdapterResult{Adapter: "netdata", Ok: true, Stats: stats}
}
