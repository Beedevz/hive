package adapters

import (
	"fmt"
	"net/http"
)

// Jellyfin adapter — requires API key (Dashboard → API Keys).
// adapter_config: { token: "${JELLYFIN_TOKEN}" }
func fetchJellyfinStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	token := cfgStr(cfg, "token")
	if token == "" {
		return errResult("jellyfin", "token not configured")
	}

	client := newHTTPClient(false)

	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("X-Emby-Token", token)
		req.Header.Set("Accept", "application/json")
		return doJSON(client, req, dest)
	}

	stats := []StatItem{}

	// Version
	var info struct {
		Version string `json:"Version"`
	}
	if err := do("/System/Info", &info); err != nil {
		return errResult("jellyfin", "API unreachable: "+err.Error())
	}
	if info.Version != "" {
		stats = append(stats, StatItem{Label: "Version", Value: info.Version, Status: "info"})
	}

	// Active streams
	var sessions []struct {
		NowPlayingItem *struct {
			Name string `json:"Name"`
		} `json:"NowPlayingItem"`
	}
	if err := do("/Sessions", &sessions); err == nil {
		playing := 0
		for _, s := range sessions {
			if s.NowPlayingItem != nil {
				playing++
			}
		}
		streamStatus := "info"
		if playing > 0 {
			streamStatus = "ok"
		}
		stats = append(stats, StatItem{Label: "Streams", Value: fmt.Sprintf("%d active", playing), Status: streamStatus})
	}

	// Library counts
	var counts struct {
		MovieCount  int `json:"MovieCount"`
		SeriesCount int `json:"SeriesCount"`
	}
	if err := do("/Items/Counts", &counts); err == nil {
		if counts.MovieCount > 0 {
			stats = append(stats, StatItem{Label: "Movies", Value: formatCount(counts.MovieCount), Status: "info"})
		}
		if counts.SeriesCount > 0 {
			stats = append(stats, StatItem{Label: "Series", Value: formatCount(counts.SeriesCount), Status: "info"})
		}
	}

	return AdapterResult{Adapter: "jellyfin", Ok: true, Stats: stats}
}
