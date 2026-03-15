package adapters

import (
	"fmt"
	"net/http"
)

// Nextcloud adapter — Basic Auth (admin user).
// adapter_config: { username: "${NC_USER}", password: "${NC_PASS}" }
func fetchNextcloudStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	user := cfgStr(cfg, "username")
	pass := cfgStr(cfg, "password")
	if user == "" || pass == "" {
		return errResult("nextcloud", "username/password not configured")
	}

	client := newHTTPClient(false)

	req, err := http.NewRequest("GET", baseURL+"/ocs/v1.php/apps/serverinfo/api/v1/info?format=json", nil)
	if err != nil {
		return errResult("nextcloud", "request error: "+err.Error())
	}
	req.SetBasicAuth(user, pass)
	req.Header.Set("OCS-APIREQUEST", "true")

	var resp struct {
		Ocs struct {
			Data struct {
				Nextcloud struct {
					System  struct{ Version string `json:"version"` } `json:"system"`
					Storage struct {
						NumUsers int `json:"num_users"`
						NumFiles int `json:"num_files"`
					} `json:"storage"`
				} `json:"nextcloud"`
				ActiveUsers struct {
					Last24Hours int `json:"last24hours"`
				} `json:"activeUsers"`
			} `json:"data"`
		} `json:"ocs"`
	}
	if err := doJSON(client, req, &resp); err != nil {
		return errResult("nextcloud", "API unreachable: "+err.Error())
	}

	data := resp.Ocs.Data
	stats := []StatItem{}

	if v := data.Nextcloud.System.Version; v != "" {
		stats = append(stats, StatItem{Label: "Version", Value: v, Status: "info"})
	}
	stats = append(stats, StatItem{Label: "Users", Value: fmt.Sprintf("%d", data.Nextcloud.Storage.NumUsers), Status: "info"})
	if data.Nextcloud.Storage.NumFiles > 0 {
		stats = append(stats, StatItem{Label: "Files", Value: formatCount(data.Nextcloud.Storage.NumFiles), Status: "info"})
	}
	if data.ActiveUsers.Last24Hours > 0 {
		stats = append(stats, StatItem{Label: "Active (24h)", Value: fmt.Sprintf("%d", data.ActiveUsers.Last24Hours), Status: "ok"})
	}

	return AdapterResult{Adapter: "nextcloud", Ok: true, Stats: stats}
}
