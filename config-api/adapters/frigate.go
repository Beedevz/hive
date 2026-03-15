package adapters

import (
	"fmt"
	"net/http"
)

// Frigate adapter — no auth required by default.
// adapter_config: {}
func fetchFrigateStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	client := newHTTPClient(false)
	req, err := http.NewRequest("GET", baseURL+"/api/stats", nil)
	if err != nil {
		return errResult("frigate", "request error: "+err.Error())
	}
	var statsResp struct {
		Cameras map[string]struct {
			CameraFps    float64 `json:"camera_fps"`
			DetectionFps float64 `json:"detection_fps"`
			CapturePid   int     `json:"capture_pid"`
		} `json:"cameras"`
		Detectors map[string]struct {
			DetectionStart float64 `json:"detection_start"`
			PID            int     `json:"pid"`
		} `json:"detectors"`
	}
	if err := doJSON(client, req, &statsResp); err != nil {
		return errResult("frigate", "API unreachable: "+err.Error())
	}
	stats := []StatItem{}
	stats = append(stats, StatItem{Label: "Cameras", Value: fmt.Sprintf("%d", len(statsResp.Cameras)), Status: "info"})

	detecting := 0
	for _, c := range statsResp.Cameras {
		if c.DetectionFps > 0 {
			detecting++
		}
	}
	if detecting > 0 {
		stats = append(stats, StatItem{Label: "Detecting", Value: fmt.Sprintf("%d active", detecting), Status: "ok"})
	}
	if len(statsResp.Detectors) > 0 {
		stats = append(stats, StatItem{Label: "Detectors", Value: fmt.Sprintf("%d", len(statsResp.Detectors)), Status: "info"})
	}
	return AdapterResult{Adapter: "frigate", Ok: true, Stats: stats}
}
