package adapters

import (
	"fmt"
	"net/http"
)

// Portainer adapter — requires API token (Account → Access tokens).
// adapter_config: { token: "${PORTAINER_TOKEN}" }
func fetchPortainerStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	token := cfgStr(cfg, "token")
	if token == "" {
		return errResult("portainer", "token not configured")
	}

	client := newHTTPClient(false)

	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("X-API-Key", token)
		return doJSON(client, req, dest)
	}

	var endpoints []struct {
		ID     int    `json:"Id"`
		Name   string `json:"Name"`
		Status int    `json:"Status"`
	}
	if err := do("/api/endpoints", &endpoints); err != nil {
		return errResult("portainer", "API unreachable: "+err.Error())
	}

	stats := []StatItem{}
	stats = append(stats, StatItem{Label: "Endpoints", Value: fmt.Sprintf("%d", len(endpoints)), Status: "info"})

	totalRunning, totalStopped := 0, 0
	for _, ep := range endpoints {
		var containers []struct {
			State string `json:"State"`
		}
		if err := do(fmt.Sprintf("/api/endpoints/%d/docker/containers/json?all=true", ep.ID), &containers); err != nil {
			continue
		}
		for _, c := range containers {
			if c.State == "running" {
				totalRunning++
			} else {
				totalStopped++
			}
		}
	}

	runStatus := "ok"
	if totalRunning == 0 {
		runStatus = "warn"
	}
	stats = append(stats, StatItem{Label: "Running", Value: fmt.Sprintf("%d", totalRunning), Status: runStatus})
	if totalStopped > 0 {
		stats = append(stats, StatItem{Label: "Stopped", Value: fmt.Sprintf("%d", totalStopped), Status: "warn"})
	}

	return AdapterResult{Adapter: "portainer", Ok: true, Stats: stats}
}
