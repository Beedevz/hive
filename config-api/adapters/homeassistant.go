package adapters

import (
	"fmt"
	"net/http"
	"strings"
)

// Home Assistant adapter — requires Long-Lived Access Token.
// adapter_config: { token: "${HASS_TOKEN}" }
func fetchHomeAssistantStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	token := cfgStr(cfg, "token")
	if token == "" {
		return errResult("homeassistant", "token not configured")
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

	// Config / version
	var haConfig struct {
		Version      string `json:"version"`
		LocationName string `json:"location_name"`
	}
	if err := do("/api/config", &haConfig); err != nil {
		return errResult("homeassistant", "API unreachable: "+err.Error())
	}
	if haConfig.Version != "" {
		stats = append(stats, StatItem{Label: "Version", Value: haConfig.Version, Status: "info"})
	}

	// Entity states — count by domain
	var states []struct {
		EntityID string `json:"entity_id"`
	}
	if err := do("/api/states", &states); err == nil {
		domains := map[string]int{}
		for _, s := range states {
			parts := strings.SplitN(s.EntityID, ".", 2)
			if len(parts) == 2 {
				domains[parts[0]]++
			}
		}
		stats = append(stats, StatItem{Label: "Entities", Value: fmt.Sprintf("%d", len(states)), Status: "info"})
		for _, d := range []string{"automation", "light", "switch", "sensor"} {
			if n := domains[d]; n > 0 {
				label := strings.ToUpper(d[:1]) + d[1:] + "s"
				stats = append(stats, StatItem{Label: label, Value: fmt.Sprintf("%d", n), Status: "info"})
			}
		}
	}

	return AdapterResult{Adapter: "homeassistant", Ok: true, Stats: stats}
}
