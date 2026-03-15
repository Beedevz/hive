package adapters

import (
	"fmt"
	"net/http"
)

// Traefik adapter — API must be enabled (api: {} in traefik.yml).
// adapter_config: { username: "${TRAEFIK_USER}", password: "${TRAEFIK_PASS}" }  ← optional basic auth
func fetchTraefikStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	user := cfgStr(cfg, "username")
	pass := cfgStr(cfg, "password")

	client := newHTTPClient(false)

	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		if user != "" {
			req.SetBasicAuth(user, pass)
		}
		return doJSON(client, req, dest)
	}

	var overview struct {
		HTTP struct {
			Routers struct {
				Total    int `json:"total"`
				Warnings int `json:"warnings"`
				Errors   int `json:"errors"`
			} `json:"routers"`
			Services struct {
				Total  int `json:"total"`
				Errors int `json:"errors"`
			} `json:"services"`
			Middlewares struct {
				Total int `json:"total"`
			} `json:"middlewares"`
		} `json:"http"`
		Version string `json:"version"`
	}
	if err := do("/api/overview", &overview); err != nil {
		return errResult("traefik", "API unreachable: "+err.Error())
	}

	stats := []StatItem{}
	if overview.Version != "" {
		stats = append(stats, StatItem{Label: "Version", Value: overview.Version, Status: "info"})
	}

	routerStatus := "ok"
	if overview.HTTP.Routers.Errors > 0 {
		routerStatus = "error"
	} else if overview.HTTP.Routers.Warnings > 0 {
		routerStatus = "warn"
	}
	stats = append(stats, StatItem{Label: "Routers", Value: fmt.Sprintf("%d", overview.HTTP.Routers.Total), Status: routerStatus})
	stats = append(stats, StatItem{Label: "Services", Value: fmt.Sprintf("%d", overview.HTTP.Services.Total), Status: "info"})
	if overview.HTTP.Middlewares.Total > 0 {
		stats = append(stats, StatItem{Label: "Middlewares", Value: fmt.Sprintf("%d", overview.HTTP.Middlewares.Total), Status: "info"})
	}

	return AdapterResult{Adapter: "traefik", Ok: true, Stats: stats}
}
