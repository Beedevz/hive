package adapters

import (
	"fmt"
	"net/http"
)

// Plex adapter — requires X-Plex-Token.
// adapter_config: { token: "${PLEX_TOKEN}" }
func fetchPlexStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	token := cfgStr(cfg, "token")
	if token == "" {
		return errResult("plex", "token not configured")
	}

	client := newHTTPClient(false)

	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("X-Plex-Token", token)
		req.Header.Set("Accept", "application/json")
		return doJSON(client, req, dest)
	}

	stats := []StatItem{}

	// Active sessions
	var sessions struct {
		MediaContainer struct {
			Size int `json:"size"`
		} `json:"MediaContainer"`
	}
	if err := do("/status/sessions", &sessions); err != nil {
		return errResult("plex", "API unreachable: "+err.Error())
	}
	streamStatus := "info"
	if sessions.MediaContainer.Size > 0 {
		streamStatus = "ok"
	}
	stats = append(stats, StatItem{
		Label:  "Streams",
		Value:  fmt.Sprintf("%d active", sessions.MediaContainer.Size),
		Status: streamStatus,
	})

	// Library sections
	var libraries struct {
		MediaContainer struct {
			Size      int `json:"size"`
			Directory []struct {
				Type string `json:"type"`
			} `json:"Directory"`
		} `json:"MediaContainer"`
	}
	if err := do("/library/sections", &libraries); err == nil {
		movies, shows := 0, 0
		for _, lib := range libraries.MediaContainer.Directory {
			switch lib.Type {
			case "movie":
				movies++
			case "show":
				shows++
			}
		}
		if movies > 0 {
			stats = append(stats, StatItem{Label: "Movie libs", Value: fmt.Sprintf("%d", movies), Status: "info"})
		}
		if shows > 0 {
			stats = append(stats, StatItem{Label: "TV libs", Value: fmt.Sprintf("%d", shows), Status: "info"})
		}
	}

	return AdapterResult{Adapter: "plex", Ok: true, Stats: stats}
}
