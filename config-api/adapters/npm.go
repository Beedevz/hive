package adapters

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

// Nginx Proxy Manager adapter — JWT auth via username/password.
// adapter_config: { username: "${NPM_USER}", password: "${NPM_PASS}" }
func fetchNPMStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	user := cfgStr(cfg, "username")
	pass := cfgStr(cfg, "password")
	if user == "" || pass == "" {
		return errResult("npm", "username/password not configured")
	}

	client := newHTTPClient(false)

	loginBody, _ := json.Marshal(map[string]string{"identity": user, "secret": pass})
	loginReq, err := http.NewRequest("POST", baseURL+"/api/tokens", bytes.NewReader(loginBody))
	if err != nil {
		return errResult("npm", "request build error: "+err.Error())
	}
	loginReq.Header.Set("Content-Type", "application/json")

	var tokenResp struct {
		Token string `json:"token"`
	}
	if err := doJSON(client, loginReq, &tokenResp); err != nil {
		return errResult("npm", "auth failed: "+err.Error())
	}
	if tokenResp.Token == "" {
		return errResult("npm", "empty token from NPM")
	}

	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+tokenResp.Token)
		return doJSON(client, req, dest)
	}

	stats := []StatItem{}

	var hosts []struct {
		Enabled     bool     `json:"enabled"`
		DomainNames []string `json:"domain_names"`
	}
	if err := do("/api/nginx/proxy-hosts", &hosts); err != nil {
		return errResult("npm", "failed to fetch proxy hosts: "+err.Error())
	}
	enabled := 0
	for _, h := range hosts {
		if h.Enabled {
			enabled++
		}
	}
	stats = append(stats, StatItem{Label: "Proxies", Value: fmt.Sprintf("%d / %d", enabled, len(hosts)), Status: "ok"})

	var certs []struct{ ID int `json:"id"` }
	if err := do("/api/nginx/certificates", &certs); err == nil {
		stats = append(stats, StatItem{Label: "SSL Certs", Value: fmt.Sprintf("%d", len(certs)), Status: "ok"})
	}

	return AdapterResult{Adapter: "npm", Ok: true, Stats: stats}
}
