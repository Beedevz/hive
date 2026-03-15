package adapters

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

// Unifi Controller adapter — username/password auth.
// adapter_config: { username: "${UNIFI_USER}", password: "${UNIFI_PASS}", site: "default" }
func fetchUnifiStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	user := cfgStr(cfg, "username")
	pass := cfgStr(cfg, "password")
	site := cfgStr(cfg, "site")
	if user == "" || pass == "" {
		return errResult("unifi", "username/password not configured")
	}
	if site == "" {
		site = "default"
	}

	jar := &simpleCookieJar{}
	client := &http.Client{
		Timeout:   10 * 1e9,
		Transport: newHTTPClient(true).Transport, // self-signed cert
		Jar:       jar,
	}

	// Login
	loginBody, _ := json.Marshal(map[string]string{"username": user, "password": pass})
	loginReq, err := http.NewRequest("POST", baseURL+"/api/login", bytes.NewReader(loginBody))
	if err != nil {
		return errResult("unifi", "request error: "+err.Error())
	}
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp, err := client.Do(loginReq)
	if err != nil {
		return errResult("unifi", "API unreachable: "+err.Error())
	}
	loginResp.Body.Close()
	if loginResp.StatusCode != 200 {
		return errResult("unifi", fmt.Sprintf("auth failed: HTTP %d", loginResp.StatusCode))
	}

	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		return doJSON(client, req, dest)
	}

	stats := []StatItem{}
	var health []struct {
		Subsystem string `json:"subsystem"`
		Status    string `json:"status"`
		NumAp     int    `json:"num_ap,omitempty"`
		NumUser   int    `json:"num_user,omitempty"`
	}
	if err := do("/api/s/"+site+"/stat/health", &health); err != nil {
		return errResult("unifi", "failed to get health: "+err.Error())
	}

	for _, h := range health {
		switch h.Subsystem {
		case "wlan":
			statusColor := "ok"
			if h.Status != "ok" {
				statusColor = "warn"
			}
			stats = append(stats, StatItem{Label: "APs", Value: fmt.Sprintf("%d", h.NumAp), Status: statusColor})
			stats = append(stats, StatItem{Label: "Clients", Value: fmt.Sprintf("%d", h.NumUser), Status: "info"})
		case "wan":
			statusColor := "ok"
			if h.Status != "ok" {
				statusColor = "error"
			}
			stats = append(stats, StatItem{Label: "WAN", Value: h.Status, Status: statusColor})
		}
	}
	return AdapterResult{Adapter: "unifi", Ok: true, Stats: stats}
}
