package adapters

import (
	"fmt"
	"math"
	"net/http"
)

// Glances adapter — system monitoring, typically no auth.
// adapter_config: {}
func fetchGlancesStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	client := newHTTPClient(false)
	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		return doJSON(client, req, dest)
	}
	stats := []StatItem{}
	var cpu struct {
		Total float64 `json:"total"`
	}
	if err := do("/api/3/cpu", &cpu); err != nil {
		return errResult("glances", "API unreachable: "+err.Error())
	}
	cpuPct := math.Round(cpu.Total*10) / 10
	cpuStatus := "ok"
	if cpuPct > 80 {
		cpuStatus = "error"
	} else if cpuPct > 60 {
		cpuStatus = "warn"
	}
	stats = append(stats, StatItem{Label: "CPU", Value: fmt.Sprintf("%.1f%%", cpuPct), Status: cpuStatus})

	var mem struct {
		Percent float64 `json:"percent"`
		Total   int64   `json:"total"`
		Used    int64   `json:"used"`
	}
	if err := do("/api/3/mem", &mem); err == nil {
		memStatus := "ok"
		if mem.Percent > 85 {
			memStatus = "error"
		} else if mem.Percent > 70 {
			memStatus = "warn"
		}
		stats = append(stats, StatItem{Label: "Memory", Value: fmt.Sprintf("%.1f%%", math.Round(mem.Percent*10)/10), Status: memStatus})
	}

	var fs []struct {
		MntPoint string `json:"mnt_point"`
		Size     int64  `json:"size"`
		Used     int64  `json:"used"`
	}
	if err := do("/api/3/fs", &fs); err == nil && len(fs) > 0 {
		for _, f := range fs {
			if f.MntPoint == "/" && f.Size > 0 {
				pct := float64(f.Used) / float64(f.Size) * 100
				fsStatus := "ok"
				if pct > 90 {
					fsStatus = "error"
				} else if pct > 75 {
					fsStatus = "warn"
				}
				stats = append(stats, StatItem{Label: "Disk", Value: fmt.Sprintf("%.1f%%", math.Round(pct*10)/10), Status: fsStatus})
				break
			}
		}
	}
	return AdapterResult{Adapter: "glances", Ok: true, Stats: stats}
}
