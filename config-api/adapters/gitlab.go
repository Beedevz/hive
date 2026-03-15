package adapters

import (
	"fmt"
	"net/http"
)

// GitLab adapter — requires Personal Access Token with read_api scope.
// adapter_config: { token: "${GITLAB_TOKEN}" }
func fetchGitLabStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	token := cfgStr(cfg, "token")
	if token == "" {
		return errResult("gitlab", "token not configured")
	}

	client := newHTTPClient(false)

	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("PRIVATE-TOKEN", token)
		return doJSON(client, req, dest)
	}

	stats := []StatItem{}

	var ver struct {
		Version string `json:"version"`
	}
	if err := do("/api/v4/version", &ver); err != nil {
		return errResult("gitlab", "API unreachable: "+err.Error())
	}
	if ver.Version != "" {
		stats = append(stats, StatItem{Label: "Version", Value: ver.Version, Status: "info"})
	}

	var mrs []struct{ ID int `json:"id"` }
	if err := do("/api/v4/merge_requests?state=opened&scope=all&per_page=100", &mrs); err == nil {
		status := "ok"
		if len(mrs) > 10 {
			status = "warn"
		}
		stats = append(stats, StatItem{Label: "Open MRs", Value: fmt.Sprintf("%d", len(mrs)), Status: status})
	}

	var projects []struct{ ID int `json:"id"` }
	_ = do("/api/v4/projects?membership=true&simple=true&per_page=100", &projects)

	running, failed := 0, 0
	for _, p := range projects {
		var pipes []struct {
			Status string `json:"status"`
		}
		if err := do(fmt.Sprintf("/api/v4/projects/%d/pipelines?per_page=20", p.ID), &pipes); err == nil {
			for _, pi := range pipes {
				switch pi.Status {
				case "running":
					running++
				case "failed":
					failed++
				}
			}
		}
	}

	pipeStatus := "ok"
	if running > 0 {
		pipeStatus = "warn"
	}
	stats = append(stats, StatItem{Label: "Pipelines", Value: fmt.Sprintf("%d running", running), Status: pipeStatus})
	if failed > 0 {
		stats = append(stats, StatItem{Label: "Failed", Value: fmt.Sprintf("%d", failed), Status: "error"})
	}

	return AdapterResult{Adapter: "gitlab", Ok: true, Stats: stats}
}
