package adapters

import (
	"fmt"
	"math"
	"net/http"
	"net/url"
)

// Synology DSM adapter — username/password auth.
// adapter_config: { username: "${SYNO_USER}", password: "${SYNO_PASS}" }
func fetchSynologyStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	user := cfgStr(cfg, "username")
	pass := cfgStr(cfg, "password")
	if user == "" || pass == "" {
		return errResult("synology", "username/password not configured")
	}
	jar := &simpleCookieJar{}
	client := &http.Client{
		Timeout:   10 * 1e9,
		Transport: newHTTPClient(true).Transport,
		Jar:       jar,
	}
	// Login
	loginURL := baseURL + "/webapi/auth.cgi?api=SYNO.API.Auth&version=3&method=login" +
		"&account=" + url.QueryEscape(user) +
		"&passwd=" + url.QueryEscape(pass) +
		"&session=homepage&format=cookie"
	req, err := http.NewRequest("GET", loginURL, nil)
	if err != nil {
		return errResult("synology", "request error: "+err.Error())
	}
	var loginResp struct {
		Success bool `json:"success"`
		Error   struct {
			Code int `json:"code"`
		} `json:"error"`
	}
	if err := doJSON(client, req, &loginResp); err != nil {
		return errResult("synology", "API unreachable: "+err.Error())
	}
	if !loginResp.Success {
		return errResult("synology", fmt.Sprintf("auth failed (code %d)", loginResp.Error.Code))
	}
	stats := []StatItem{}
	// Storage info
	var storageInfo struct {
		Success bool `json:"success"`
		Data    struct {
			Volumes []struct {
				Name      string `json:"vol_path"`
				Status    string `json:"status"`
				SizeTotal int64  `json:"size_total_byte,omitempty"`
				SizeUsed  int64  `json:"size_used_byte,omitempty"`
			} `json:"volumes"`
		} `json:"data"`
	}
	storageReq, _ := http.NewRequest("GET", baseURL+"/webapi/entry.cgi?api=SYNO.Storage.CGI.Storage&version=1&method=load_info", nil)
	if err := doJSON(client, storageReq, &storageInfo); err == nil && storageInfo.Success {
		for _, vol := range storageInfo.Data.Volumes {
			if vol.SizeTotal > 0 {
				pct := math.Round(float64(vol.SizeUsed)/float64(vol.SizeTotal)*1000) / 10
				volStatus := "ok"
				if pct > 85 {
					volStatus = "error"
				} else if pct > 70 {
					volStatus = "warn"
				}
				stats = append(stats, StatItem{Label: vol.Name, Value: fmt.Sprintf("%.1f%% used", pct), Status: volStatus})
			}
		}
	}
	// System info for version
	var sysInfo struct {
		Success bool `json:"success"`
		Data    struct {
			DSMVersion string `json:"DSMVersion,omitempty"`
		} `json:"data"`
	}
	sysReq, _ := http.NewRequest("GET", baseURL+"/webapi/entry.cgi?api=SYNO.DSM.Info&version=2&method=getinfo", nil)
	if err := doJSON(client, sysReq, &sysInfo); err == nil && sysInfo.Success && sysInfo.Data.DSMVersion != "" {
		stats = append([]StatItem{{Label: "Version", Value: sysInfo.Data.DSMVersion, Status: "info"}}, stats...)
	}
	return AdapterResult{Adapter: "synology", Ok: true, Stats: stats}
}
