package adapters

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// WD My Cloud adapter — OS 5 firmware (v5.x).
// adapter_config: { username: "${WD_USER}", password: "${WD_PASS}" }
// Auth: POST /nas/v1/auth with base64-encoded password → session cookies
// Data: POST /xml/sysinfo.xml → XML with disk/RAID/volume info
func fetchWDMyCloudStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	username := cfgStr(cfg, "username")
	password := cfgStr(cfg, "password")
	if username == "" || password == "" {
		return errResult("wdmycloud", "username/password not configured")
	}

	// WD uses self-signed certs; cookie jar needed for session
	jar := &simpleCookieJar{}
	client := &http.Client{
		Timeout:   10 * time.Second,
		Transport: newHTTPClient(true).Transport, // InsecureSkipVerify for self-signed cert
		Jar:       jar,
	}

	// ── 1. Authenticate ───────────────────────────────────────────
	authBody, _ := json.Marshal(map[string]string{
		"username": username,
		"password": base64.StdEncoding.EncodeToString([]byte(password)),
	})
	authReq, err := http.NewRequest("POST", baseURL+"/nas/v1/auth", bytes.NewReader(authBody))
	if err != nil {
		return errResult("wdmycloud", "auth request error: "+err.Error())
	}
	authReq.Header.Set("Content-Type", "application/json")

	authResp, err := client.Do(authReq)
	if err != nil {
		return errResult("wdmycloud", "API unreachable: "+err.Error())
	}
	authResp.Body.Close()
	if authResp.StatusCode != http.StatusOK {
		return errResult("wdmycloud", fmt.Sprintf("auth failed: HTTP %d", authResp.StatusCode))
	}

	// ── 2. Fetch sysinfo.xml ──────────────────────────────────────
	ts := fmt.Sprintf("%d", time.Now().UnixMilli())
	sysinfoReq, err := http.NewRequest("POST", baseURL+"/xml/sysinfo.xml?id="+ts, nil)
	if err != nil {
		return errResult("wdmycloud", "sysinfo request error: "+err.Error())
	}

	sysinfoResp, err := client.Do(sysinfoReq)
	if err != nil {
		return errResult("wdmycloud", "sysinfo fetch failed: "+err.Error())
	}
	defer sysinfoResp.Body.Close()

	body, err := io.ReadAll(sysinfoResp.Body)
	if err != nil {
		return errResult("wdmycloud", "sysinfo read error: "+err.Error())
	}

	// ── 3. Parse XML ──────────────────────────────────────────────
	var config wdConfig
	if err := xml.Unmarshal(body, &config); err != nil {
		return errResult("wdmycloud", "XML parse failed: "+err.Error())
	}

	stats := []StatItem{}

	// Storage usage
	if config.Vols.TotalSizeH != "" {
		storageStatus := "ok"
		if config.Vols.TotalSize > 0 {
			usedPct := float64(config.Vols.TotalUsedSize) / float64(config.Vols.TotalSize) * 100
			if usedPct > 85 {
				storageStatus = "error"
			} else if usedPct > 70 {
				storageStatus = "warn"
			}
		}
		stats = append(stats, StatItem{
			Label:  "Storage",
			Value:  fmt.Sprintf("%s / %s", config.Vols.TotalUsedSizeH, config.Vols.TotalSizeH),
			Status: storageStatus,
		})
	}

	// RAID status (one stat per array)
	for _, raid := range config.Raids.Raids {
		state := raid.State
		raidStatus := "ok"
		switch {
		case raid.NumOfFailedDisks > 0:
			raidStatus = "error"
			state = fmt.Sprintf("%s — %d failed", state, raid.NumOfFailedDisks)
		case state == "degraded":
			raidStatus = "warn"
		case strings.Contains(state, "recover"), strings.Contains(state, "rebuild"):
			raidStatus = "warn"
		}
		level := strings.ToUpper(raid.Level) // "raid1" → "RAID1"
		stats = append(stats, StatItem{
			Label:  level,
			Value:  fmt.Sprintf("%s (%d/%d disks)", state, raid.NumOfActiveDisks, raid.NumOfTotalDisks),
			Status: raidStatus,
		})
	}

	// Disk temperatures
	if len(config.Disks.Disks) > 0 {
		hottest := 0
		for _, d := range config.Disks.Disks {
			if d.Connected == 1 && d.Temp > hottest {
				hottest = d.Temp
			}
		}
		if hottest > 0 {
			tempStatus := "ok"
			if hottest > 55 {
				tempStatus = "error"
			} else if hottest > 48 {
				tempStatus = "warn"
			}
			stats = append(stats, StatItem{
				Label:  "Temp",
				Value:  fmt.Sprintf("%d°C (max)", hottest),
				Status: tempStatus,
			})
		}
	}

	return AdapterResult{Adapter: "wdmycloud", Ok: true, Stats: stats}
}

// ── XML structs ───────────────────────────────────────────────────

type wdConfig struct {
	XMLName xml.Name `xml:"config"`
	Disks   wdDisks  `xml:"disks"`
	Raids   wdRaids  `xml:"raids"`
	Vols    wdVols   `xml:"vols"`
}

type wdDisks struct {
	Disks []wdDisk `xml:"disk"`
}

type wdDisk struct {
	ID        int    `xml:"id,attr"`
	Name      string `xml:"name"`
	Model     string `xml:"model"`
	Size      int64  `xml:"size"`
	Connected int    `xml:"connected"`
	Temp      int    `xml:"temp"`
	Failed    int    `xml:"failed"`
	Healthy   int    `xml:"healthy"`
}

type wdRaids struct {
	Raids []wdRaid `xml:"raid"`
}

type wdRaid struct {
	ID               int    `xml:"id,attr"`
	Level            string `xml:"level"`
	State            string `xml:"state"`
	NumOfTotalDisks  int    `xml:"num_of_total_disks"`
	NumOfActiveDisks int    `xml:"num_of_active_disks"`
	NumOfFailedDisks int    `xml:"num_of_failed_disks"`
}

type wdVols struct {
	TotalSize        int64  `xml:"total_size"`
	TotalUsedSize    int64  `xml:"total_used_size"`
	TotalSizeH       string `xml:"total_size_h"`
	TotalUsedSizeH   string `xml:"total_used_size_h"`
	TotalUnusedSizeH string `xml:"total_unused_size_h"`
}
