package adapters

import (
	"fmt"
	"net/http"
)

// Gitea / Forgejo adapter — requires Personal Access Token.
// adapter_config: { token: "${GITEA_TOKEN}" }
func fetchGiteaStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	token := cfgStr(cfg, "token")
	if token == "" {
		return errResult("gitea", "token not configured")
	}
	client := newHTTPClient(false)
	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "token "+token)
		return doJSON(client, req, dest)
	}
	stats := []StatItem{}
	var version struct {
		Version string `json:"version"`
	}
	if err := do("/api/v1/version", &version); err != nil {
		return errResult("gitea", "API unreachable: "+err.Error())
	}
	if version.Version != "" {
		stats = append(stats, StatItem{Label: "Version", Value: version.Version, Status: "info"})
	}
	// My repos
	var repos []struct {
		ID int `json:"id"`
	}
	if err := do("/api/v1/repos/search?limit=50&page=1", &repos); err == nil {
		stats = append(stats, StatItem{Label: "Repos", Value: fmt.Sprintf("%d+", len(repos)), Status: "info"})
	}
	// Open issues assigned to me
	var issues []struct {
		ID int `json:"id"`
	}
	if err := do("/api/v1/issues?type=issues&state=open&limit=50", &issues); err == nil {
		s := "ok"
		if len(issues) > 10 {
			s = "warn"
		}
		stats = append(stats, StatItem{Label: "Issues", Value: fmt.Sprintf("%d open", len(issues)), Status: s})
	}
	return AdapterResult{Adapter: "gitea", Ok: true, Stats: stats}
}
