package adapters

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// SABnzbd adapter — requires API key (Config → General → API Key).
// adapter_config: { apikey: "${SABNZBD_APIKEY}" }
func fetchSABnzbdStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	apikey := cfgStr(cfg, "apikey")
	if apikey == "" {
		return errResult("sabnzbd", "apikey not configured")
	}
	client := newHTTPClient(false)
	do := func(mode string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+"/api?mode="+mode+"&output=json&apikey="+apikey, nil)
		if err != nil {
			return err
		}
		return doJSON(client, req, dest)
	}
	stats := []StatItem{}
	var queue struct {
		Queue struct {
			Status         string `json:"status"`
			Speed          string `json:"speed"`
			Mb             string `json:"mb"`
			MbLeft         string `json:"mbleft"`
			NoOfSlotsTotal int    `json:"noofslots_total"`
		} `json:"queue"`
	}
	if err := do("queue", &queue); err != nil {
		return errResult("sabnzbd", "API unreachable: "+err.Error())
	}
	q := queue.Queue
	statusColor := "ok"
	if strings.EqualFold(q.Status, "paused") {
		statusColor = "warn"
	}
	stats = append(stats, StatItem{Label: "Status", Value: q.Status, Status: statusColor})
	if q.Speed != "" && q.Speed != "0 " {
		stats = append(stats, StatItem{Label: "Speed", Value: strings.TrimSpace(q.Speed) + "/s", Status: "info"})
	}
	if q.NoOfSlotsTotal > 0 {
		mbLeft, _ := strconv.ParseFloat(q.MbLeft, 64)
		stats = append(stats, StatItem{Label: "Queue", Value: fmt.Sprintf("%d jobs", q.NoOfSlotsTotal), Status: "info"})
		if mbLeft > 0 {
			stats = append(stats, StatItem{Label: "Remaining", Value: formatBytes(int64(mbLeft * 1024 * 1024)), Status: "info"})
		}
	}
	return AdapterResult{Adapter: "sabnzbd", Ok: true, Stats: stats}
}
