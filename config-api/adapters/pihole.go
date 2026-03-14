package adapters

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sync"
	"time"
)

// ── Pi-hole v6 session cache ───────────────────────────────────────
// Reuses the same SID to avoid hitting Pi-hole's session limit.
var (
	piholeSIDmu  sync.Mutex
	piholeSIDmap = make(map[string]piholeSIDEntry)
)

type piholeSIDEntry struct {
	sid string
	at  time.Time
}

const piholeSIDTTL = 4 * time.Minute

func cachedPiholeAuth(client *http.Client, baseURL, password string) (string, error) {
	key := baseURL + "\x00" + password
	piholeSIDmu.Lock()
	defer piholeSIDmu.Unlock()
	if e, ok := piholeSIDmap[key]; ok && time.Since(e.at) < piholeSIDTTL {
		return e.sid, nil
	}
	sid, err := piholeV6Auth(client, baseURL, password)
	if err != nil {
		return "", err
	}
	piholeSIDmap[key] = piholeSIDEntry{sid: sid, at: time.Now()}
	return sid, nil
}

// Pi-hole adapter — supports v5 and v6.
// v5: token is the API key (optional for basic stats)
// v6: token is the admin password (leave empty if no password set)
// adapter_config: { token: "${PIHOLE_TOKEN}" }
func fetchPiholeStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	token := cfgStr(cfg, "token")
	client := newHTTPClient(false)

	// ── Try Pi-hole v6 (/api/stats/summary) ──────────────────────
	// First attempt: no auth (works when Pi-hole has no password set)
	if result, ok := piholeV6Stats(client, baseURL, ""); ok {
		return result
	}

	// Second attempt: authenticate with password then fetch stats
	if token != "" {
		sid, err := cachedPiholeAuth(client, baseURL, token)
		if err != nil {
			// Auth explicitly failed — it's v6, no point trying v5
			return errResult("pihole", "authentication failed: "+err.Error())
		}
		if result, ok := piholeV6Stats(client, baseURL, sid); ok {
			return result
		}
	}

	// ── Fallback: Pi-hole v5 (/admin/api.php) ─────────────────────
	return fetchPiholeV5(client, baseURL, token)
}

// piholeV6Auth authenticates and returns the session ID.
func piholeV6Auth(client *http.Client, baseURL, password string) (string, error) {
	body, _ := json.Marshal(map[string]string{"password": password})
	req, err := http.NewRequest("POST", baseURL+"/api/auth", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	var authResp struct {
		Session struct {
			Sid     string `json:"sid"`
			Valid   bool   `json:"valid"`
			Message string `json:"message"`
		} `json:"session"`
	}
	if err := doJSON(client, req, &authResp); err != nil {
		return "", err
	}
	if !authResp.Session.Valid {
		msg := authResp.Session.Message
		if msg == "" {
			msg = "invalid credentials"
		}
		return "", fmt.Errorf("%s", msg)
	}
	return authResp.Session.Sid, nil
}

// piholeV6Stats fetches summary stats from Pi-hole v6 API.
func piholeV6Stats(client *http.Client, baseURL, sid string) (AdapterResult, bool) {
	url := baseURL + "/api/stats/summary"
	if sid != "" {
		url += "?sid=" + sid
	}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return AdapterResult{}, false
	}

	var data struct {
		Queries struct {
			Total          int     `json:"total"`
			Blocked        int     `json:"blocked"`
			PercentBlocked float64 `json:"percent_blocked"`
		} `json:"queries"`
		Clients struct {
			Active int `json:"active"`
		} `json:"clients"`
	}
	if err := doJSON(client, req, &data); err != nil {
		return AdapterResult{}, false
	}

	// Sanity check — if total is 0 and no clients, might be an unexpected response
	stats := buildPiholeStats("", data.Queries.Total, data.Queries.Blocked, data.Queries.PercentBlocked, data.Clients.Active)
	return AdapterResult{Adapter: "pihole", Ok: true, Stats: stats}, true
}

// fetchPiholeV5 uses the legacy /admin/api.php endpoint (Pi-hole v5).
func fetchPiholeV5(client *http.Client, baseURL, token string) AdapterResult {
	path := "/admin/api.php?summaryRaw"
	if token != "" {
		path += "&auth=" + token
	}
	req, err := http.NewRequest("GET", baseURL+path, nil)
	if err != nil {
		return errResult("pihole", "request error: "+err.Error())
	}

	var data struct {
		DNSQueriesToday    int     `json:"dns_queries_today"`
		AdsBlockedToday    int     `json:"ads_blocked_today"`
		AdsPercentageToday float64 `json:"ads_percentage_today"`
		UniqueClients      int     `json:"unique_clients"`
		Status             string  `json:"status"`
	}
	if err := doJSON(client, req, &data); err != nil {
		return errResult("pihole", "API unreachable: "+err.Error())
	}

	stats := buildPiholeStats(data.Status, data.DNSQueriesToday, data.AdsBlockedToday, data.AdsPercentageToday, data.UniqueClients)
	return AdapterResult{Adapter: "pihole", Ok: true, Stats: stats}
}

func buildPiholeStats(status string, total, blocked int, pctBlocked float64, clients int) []StatItem {
	stats := []StatItem{}

	if status != "" {
		statusVal, statusColor := "enabled", "ok"
		if status == "disabled" {
			statusVal, statusColor = "disabled", "warn"
		}
		stats = append(stats, StatItem{Label: "Status", Value: statusVal, Status: statusColor})
	}

	queryVal := fmt.Sprintf("%d", total)
	if total >= 1000 {
		queryVal = fmt.Sprintf("%.1fk", float64(total)/1000)
	}
	stats = append(stats, StatItem{Label: "Queries", Value: queryVal + "/day", Status: "info"})

	if total > 0 {
		pct := math.Round(pctBlocked*10) / 10
		blockStatus := "ok"
		if pct > 40 {
			blockStatus = "warn"
		}
		stats = append(stats, StatItem{Label: "Blocked", Value: fmt.Sprintf("%.1f%%", pct), Status: blockStatus})
	}

	if clients > 0 {
		stats = append(stats, StatItem{Label: "Clients", Value: fmt.Sprintf("%d", clients), Status: "info"})
	}

	return stats
}
