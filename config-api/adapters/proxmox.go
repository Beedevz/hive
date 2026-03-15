package adapters

import (
	"fmt"
	"math"
	"net/http"
	"strings"
)

// Proxmox adapter — API token in format "USER@REALM!TOKENID=SECRET".
// adapter_config: { token: "${PROXMOX_TOKEN}" }
func fetchProxmoxStats(cfg map[string]interface{}, baseURL string) AdapterResult {
	token := cfgStr(cfg, "token")
	if token == "" {
		return errResult("proxmox", "token not configured")
	}
	if !strings.Contains(token, "!") || !strings.Contains(token, "=") {
		return errResult("proxmox", "invalid token format — expected USER@REALM!TOKENID=SECRET")
	}

	client := newHTTPClient(true) // Proxmox self-signed cert

	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "PVEAPIToken="+token)
		return doJSON(client, req, dest)
	}

	var nodesResp struct {
		Data []struct {
			Node   string  `json:"node"`
			Status string  `json:"status"`
			CPU    float64 `json:"cpu"`
			Mem    float64 `json:"mem"`
			MaxMem float64 `json:"maxmem"`
		} `json:"data"`
	}
	if err := do("/api2/json/nodes", &nodesResp); err != nil {
		msg := err.Error()
		if strings.Contains(msg, "connection refused") || strings.Contains(msg, "no such host") {
			return errResult("proxmox", "host unreachable — check URL: "+baseURL)
		}
		if strings.Contains(msg, "HTTP 401") || strings.Contains(msg, "HTTP 403") {
			return errResult("proxmox", "authentication failed — check token")
		}
		if strings.Contains(msg, "deadline exceeded") || strings.Contains(msg, "timeout") {
			return errResult("proxmox", "connection timeout")
		}
		return errResult("proxmox", msg)
	}

	stats := []StatItem{}

	if len(nodesResp.Data) > 0 {
		totalCPU, totalMem, totalMaxMem := 0.0, 0.0, 0.0
		for _, n := range nodesResp.Data {
			totalCPU += n.CPU
			totalMem += n.Mem
			totalMaxMem += n.MaxMem
		}
		avgCPU := math.Round(totalCPU/float64(len(nodesResp.Data))*1000) / 10
		cpuStatus := "ok"
		if avgCPU > 80 {
			cpuStatus = "error"
		} else if avgCPU > 60 {
			cpuStatus = "warn"
		}
		stats = append(stats, StatItem{Label: "CPU", Value: fmt.Sprintf("%.1f%%", avgCPU), Status: cpuStatus})

		if totalMaxMem > 0 {
			memPct := math.Round(totalMem/totalMaxMem*1000) / 10
			memStatus := "ok"
			if memPct > 85 {
				memStatus = "error"
			} else if memPct > 65 {
				memStatus = "warn"
			}
			stats = append(stats, StatItem{Label: "Memory", Value: fmt.Sprintf("%.1f%%", memPct), Status: memStatus})
		}
	}

	running, total := 0, 0
	gotVMs := false

	var resourcesResp struct {
		Data []struct {
			Type   string `json:"type"`
			Status string `json:"status"`
		} `json:"data"`
	}
	if err := do("/api2/json/cluster/resources?type=vm", &resourcesResp); err == nil && len(resourcesResp.Data) > 0 {
		for _, r := range resourcesResp.Data {
			if r.Type == "qemu" || r.Type == "lxc" {
				total++
				if r.Status == "running" {
					running++
				}
				gotVMs = true
			}
		}
	}

	if !gotVMs {
		for _, node := range nodesResp.Data {
			var qemuResp struct {
				Data []struct{ Status string `json:"status"` } `json:"data"`
			}
			if err := do("/api2/json/nodes/"+node.Node+"/qemu", &qemuResp); err == nil {
				for _, vm := range qemuResp.Data {
					total++
					if vm.Status == "running" {
						running++
					}
					gotVMs = true
				}
			}
			var lxcResp struct {
				Data []struct{ Status string `json:"status"` } `json:"data"`
			}
			if err := do("/api2/json/nodes/"+node.Node+"/lxc", &lxcResp); err == nil {
				for _, ct := range lxcResp.Data {
					total++
					if ct.Status == "running" {
						running++
					}
					gotVMs = true
				}
			}
		}
	}

	if gotVMs || total > 0 {
		vmStatus := "ok"
		if running < total {
			vmStatus = "warn"
		}
		stats = append(stats, StatItem{Label: "VMs/CTs", Value: fmt.Sprintf("%d / %d", running, total), Status: vmStatus})
	} else {
		stats = append(stats, StatItem{Label: "VMs/CTs", Value: "no access", Status: "warn"})
	}

	return AdapterResult{Adapter: "proxmox", Ok: true, Stats: stats}
}
