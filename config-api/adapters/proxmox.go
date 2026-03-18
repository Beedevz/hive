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

	client := newHTTPClient(true)

	do := func(path string, dest interface{}) error {
		req, err := http.NewRequest("GET", baseURL+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "PVEAPIToken="+token)
		return doJSON(client, req, dest)
	}

	stats := proxmoxVersionStat(do)
	stats = append(stats, proxmoxNodeStats(do)...)
	stats = append(stats, proxmoxVMStats(do)...)

	return AdapterResult{Adapter: "proxmox", Ok: true, Stats: stats}
}

// proxmoxVersionStat fetches PVE version via GET /api2/json/version.
func proxmoxVersionStat(do func(string, interface{}) error) []StatItem {
	var resp struct {
		Data struct {
			Version string `json:"version"`
		} `json:"data"`
	}
	if err := do("/api2/json/version", &resp); err != nil || resp.Data.Version == "" {
		return nil
	}
	return []StatItem{{Label: "Version", Value: "v" + resp.Data.Version, Status: "info"}}
}

type proxmoxNode struct {
	Node   string
	Status string
	CPU    float64
	Mem    float64
	MaxMem float64
}

// proxmoxNodeStats fetches node list and returns Nodes + CPU + Memory stats.
func proxmoxNodeStats(do func(string, interface{}) error) []StatItem {
	var resp struct {
		Data []struct {
			Node   string  `json:"node"`
			Status string  `json:"status"`
			CPU    float64 `json:"cpu"`
			Mem    float64 `json:"mem"`
			MaxMem float64 `json:"maxmem"`
		} `json:"data"`
	}
	if err := do("/api2/json/nodes", &resp); err != nil {
		return errNodeStats(err)
	}
	if len(resp.Data) == 0 {
		return nil
	}

	nodes := make([]proxmoxNode, len(resp.Data))
	online := 0
	for i, n := range resp.Data {
		nodes[i] = proxmoxNode{n.Node, n.Status, n.CPU, n.Mem, n.MaxMem}
		if n.Status == "online" {
			online++
		}
	}

	stats := []StatItem{nodeCountStat(online, len(nodes))}
	stats = append(stats, cpuMemStats(nodes, online)...)
	return stats
}

func errNodeStats(err error) []StatItem {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "connection refused"), strings.Contains(msg, "no such host"):
		return []StatItem{{Label: "Nodes", Value: "unreachable", Status: "error"}}
	case strings.Contains(msg, "HTTP 401"), strings.Contains(msg, "HTTP 403"):
		return []StatItem{{Label: "Nodes", Value: "auth failed", Status: "error"}}
	default:
		return []StatItem{{Label: "Nodes", Value: "error", Status: "error"}}
	}
}

func nodeCountStat(online, total int) StatItem {
	status := "ok"
	if online == 0 {
		status = "error"
	} else if online < total {
		status = "warn"
	}
	return StatItem{Label: "Nodes", Value: fmt.Sprintf("%d / %d", online, total), Status: status}
}

func cpuMemStats(nodes []proxmoxNode, onlineCount int) []StatItem {
	if onlineCount == 0 {
		return nil
	}
	totalCPU, totalMem, totalMaxMem := 0.0, 0.0, 0.0
	for _, n := range nodes {
		if n.Status == "online" {
			totalCPU += n.CPU
			totalMem += n.Mem
			totalMaxMem += n.MaxMem
		}
	}

	avgCPU := math.Round(totalCPU/float64(onlineCount)*1000) / 10
	cpuStatus := "ok"
	if avgCPU > 80 {
		cpuStatus = "error"
	} else if avgCPU > 60 {
		cpuStatus = "warn"
	}
	stats := []StatItem{{Label: "CPU", Value: fmt.Sprintf("%.1f%%", avgCPU), Status: cpuStatus}}

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
	return stats
}

// proxmoxVMStats returns running/total VM+CT count.
func proxmoxVMStats(do func(string, interface{}) error) []StatItem {
	running, total := countFromCluster(do)
	if running < 0 {
		running, total = countFromNodes(do)
	}
	if total == 0 {
		return []StatItem{{Label: "VMs/CTs", Value: "no access", Status: "warn"}}
	}
	status := "ok"
	if running < total {
		status = "warn"
	}
	return []StatItem{{Label: "VMs/CTs", Value: fmt.Sprintf("%d / %d", running, total), Status: status}}
}

func countFromCluster(do func(string, interface{}) error) (running, total int) {
	var resp struct {
		Data []struct {
			Type   string `json:"type"`
			Status string `json:"status"`
		} `json:"data"`
	}
	if err := do("/api2/json/cluster/resources?type=vm", &resp); err != nil || len(resp.Data) == 0 {
		return -1, 0
	}
	for _, r := range resp.Data {
		if r.Type == "qemu" || r.Type == "lxc" {
			total++
			if r.Status == "running" {
				running++
			}
		}
	}
	if total == 0 {
		return -1, 0
	}
	return running, total
}

func countFromNodes(do func(string, interface{}) error) (running, total int) {
	var nodesResp struct {
		Data []struct {
			Node string `json:"node"`
		} `json:"data"`
	}
	if err := do("/api2/json/nodes", &nodesResp); err != nil {
		return 0, 0
	}
	for _, node := range nodesResp.Data {
		r, t := countVMsOnNode(do, node.Node)
		running += r
		total += t
	}
	return running, total
}

func countVMsOnNode(do func(string, interface{}) error, node string) (running, total int) {
	type vmList struct {
		Data []struct{ Status string `json:"status"` } `json:"data"`
	}
	for _, path := range []string{"/api2/json/nodes/" + node + "/qemu", "/api2/json/nodes/" + node + "/lxc"} {
		var resp vmList
		if err := do(path, &resp); err == nil {
			for _, vm := range resp.Data {
				total++
				if vm.Status == "running" {
					running++
				}
			}
		}
	}
	return running, total
}
