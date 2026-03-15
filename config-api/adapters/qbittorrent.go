package adapters

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// qBittorrent adapter — username/password cookie login.
// adapter_config: { username: "${QB_USER}", password: "${QB_PASS}" }
func fetchQBittorrentStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	user := cfgStr(cfg, "username")
	pass := cfgStr(cfg, "password")
	if user == "" || pass == "" {
		return errResult("qbittorrent", "username/password not configured")
	}

	jar := &simpleCookieJar{}
	client := &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{},
		Jar:      jar,
	}

	// Login
	loginData := url.Values{"username": {user}, "password": {pass}}.Encode()
	loginReq, err := http.NewRequest("POST", baseURL+"/api/v2/auth/login", strings.NewReader(loginData))
	if err != nil {
		return errResult("qbittorrent", "request error: "+err.Error())
	}
	loginReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	loginReq.Header.Set("Referer", baseURL)

	resp, err := client.Do(loginReq)
	if err != nil {
		return errResult("qbittorrent", "API unreachable: "+err.Error())
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if strings.TrimSpace(string(body)) != "Ok." {
		return errResult("qbittorrent", "authentication failed")
	}

	doGet := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		return doJSON(client, req, dest)
	}

	stats := []StatItem{}

	// Transfer speeds
	var transfer struct {
		DlInfoSpeed int64 `json:"dl_info_speed"`
		UpInfoSpeed int64 `json:"up_info_speed"`
	}
	if err := doGet("/api/v2/transfer/info", &transfer); err != nil {
		return errResult("qbittorrent", "failed to get transfer info: "+err.Error())
	}
	stats = append(stats, StatItem{Label: "↓", Value: formatSpeed(transfer.DlInfoSpeed), Status: "info"})
	stats = append(stats, StatItem{Label: "↑", Value: formatSpeed(transfer.UpInfoSpeed), Status: "info"})

	// Torrent counts
	var torrents []struct {
		State string `json:"state"`
	}
	if err := doGet("/api/v2/torrents/info", &torrents); err == nil {
		downloading, seeding, paused := 0, 0, 0
		for _, t := range torrents {
			switch {
			case strings.Contains(t.State, "download") || t.State == "stalledDL" || t.State == "metaDL":
				downloading++
			case t.State == "uploading" || t.State == "stalledUP" || t.State == "forcedUP":
				seeding++
			case strings.Contains(t.State, "paused") || strings.Contains(t.State, "stopped"):
				paused++
			}
		}
		stats = append(stats, StatItem{Label: "Seeding", Value: fmt.Sprintf("%d", seeding), Status: "ok"})
		if downloading > 0 {
			stats = append(stats, StatItem{Label: "Downloading", Value: fmt.Sprintf("%d", downloading), Status: "warn"})
		}
		if paused > 0 {
			stats = append(stats, StatItem{Label: "Paused", Value: fmt.Sprintf("%d", paused), Status: "info"})
		}
	}

	return AdapterResult{Adapter: "qbittorrent", Ok: true, Stats: stats}
}

// simpleCookieJar stores cookies for qBittorrent session.
type simpleCookieJar struct {
	cookies []*http.Cookie
}

func (j *simpleCookieJar) SetCookies(_ *url.URL, cookies []*http.Cookie) {
	j.cookies = append(j.cookies, cookies...)
}

func (j *simpleCookieJar) Cookies(_ *url.URL) []*http.Cookie {
	return j.cookies
}
