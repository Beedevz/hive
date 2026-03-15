package adapters

import (
	"fmt"
	"net/http"
)

// Immich adapter — requires API key (User Settings → API Keys).
// adapter_config: { apikey: "${IMMICH_APIKEY}" }
func fetchImmichStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	apikey := cfgStr(cfg, "apikey")
	if apikey == "" {
		return errResult("immich", "apikey not configured")
	}

	client := newHTTPClient(false)

	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("x-api-key", apikey)
		return doJSON(client, req, dest)
	}

	stats := []StatItem{}

	// Server version
	var about struct {
		Version string `json:"version"`
	}
	if err := do("/api/server/about", &about); err != nil {
		// Older endpoint
		if err2 := do("/api/server-info", &about); err2 != nil {
			return errResult("immich", "API unreachable: "+err.Error())
		}
	}
	if about.Version != "" {
		stats = append(stats, StatItem{Label: "Version", Value: about.Version, Status: "info"})
	}

	// Statistics
	var statistics struct {
		Photos int   `json:"photos"`
		Videos int   `json:"videos"`
		Usage  int64 `json:"usage"`
	}
	if err := do("/api/server/statistics", &statistics); err == nil {
		stats = append(stats, StatItem{Label: "Photos", Value: formatCount(statistics.Photos), Status: "info"})
		if statistics.Videos > 0 {
			stats = append(stats, StatItem{Label: "Videos", Value: formatCount(statistics.Videos), Status: "info"})
		}
		if statistics.Usage > 0 {
			stats = append(stats, StatItem{Label: "Storage", Value: formatBytes(statistics.Usage), Status: "info"})
		}
	}

	return AdapterResult{Adapter: "immich", Ok: true, Stats: stats}
}

// immich-specific: formatBytes is in shared.go
var _ = fmt.Sprintf // ensure fmt is used
