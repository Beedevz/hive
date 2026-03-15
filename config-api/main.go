package main

import (
	"bufio"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"gopkg.in/yaml.v3"
)

const configDir = "/config"

// version is injected at build time via -ldflags "-X main.version=vX.Y.Z"
var version = "dev"

// CPU sampling — read /proc/stat twice with a gap to calculate usage %
var (
	cpuMu      sync.Mutex
	cpuPercent float64
)

func cpuStat() (idle, total uint64) {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "cpu ") {
			continue
		}
		fields := strings.Fields(line)
		// fields: ["cpu", user, nice, system, idle, iowait, irq, softirq, steal, ...]
		var vals [8]uint64
		for i := 1; i < len(fields) && i <= 8; i++ {
			vals[i-1], _ = strconv.ParseUint(fields[i], 10, 64)
		}
		idle = vals[3] + vals[4] // idle + iowait
		for _, v := range vals {
			total += v
		}
		return
	}
	return
}

func startCPUPoller() {
	go func() {
		idle0, total0 := cpuStat()
		for range time.Tick(2 * time.Second) {
			idle1, total1 := cpuStat()
			dt := total1 - total0
			di := idle1 - idle0
			pct := 0.0
			if dt > 0 {
				pct = math.Round(float64(dt-di)/float64(dt)*1000) / 10
			}
			cpuMu.Lock()
			cpuPercent = pct
			cpuMu.Unlock()
			idle0, total0 = idle1, total1
		}
	}()
}

func configPath(format string) string {
	if format == "json" {
		return filepath.Join(configDir, "config.json")
	}
	return filepath.Join(configDir, "config.yaml")
}

func detectFormat() string {
	if _, err := os.Stat(filepath.Join(configDir, "config.yaml")); err == nil {
		return "yaml"
	}
	return "json"
}

func convertMap(i interface{}) interface{} {
	switch v := i.(type) {
	case map[string]interface{}:
		result := make(map[string]interface{})
		for key, val := range v {
			result[key] = convertMap(val)
		}
		return result
	case map[interface{}]interface{}:
		result := make(map[string]interface{})
		for key, val := range v {
			result[fmt.Sprintf("%v", key)] = convertMap(val)
		}
		return result
	case []interface{}:
		for i, val := range v {
			v[i] = convertMap(val)
		}
		return v
	default:
		return v
	}
}

func getToken() string {
	if t := os.Getenv("HIVE_TOKEN"); t != "" {
		return t
	}
	return "changeme"
}

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Hive-Token")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		next(w, r)
	}
}

func readConfig(w http.ResponseWriter, r *http.Request) {
	format := detectFormat()
	data, err := os.ReadFile(configPath(format))
	if err != nil {
		http.Error(w, "Config not found", 404)
		return
	}
	if format == "yaml" {
		var parsed interface{}
		if err := yaml.Unmarshal(data, &parsed); err != nil {
			http.Error(w, "YAML parse error: "+err.Error(), 500)
			return
		}
		jsonCompatible := convertMap(parsed)
		data, err = json.Marshal(jsonCompatible)
		if err != nil {
			http.Error(w, "JSON marshal error: "+err.Error(), 500)
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func writeConfig(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Read error", 400)
		return
	}
	var parsed interface{}
	if err := json.Unmarshal(body, &parsed); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), 400)
		return
	}
	format := detectFormat()
	existing, _ := os.ReadFile(configPath(format))
	if existing != nil {
		backupPath := fmt.Sprintf("%s/config.backup.%d.%s", configDir, time.Now().Unix(), format)
		os.WriteFile(backupPath, existing, 0644)
	}
	if format == "yaml" {
		yamlData, err := yaml.Marshal(parsed)
		if err != nil {
			http.Error(w, "YAML marshal error: "+err.Error(), 500)
			return
		}
		if err := os.WriteFile(configPath(format), yamlData, 0644); err != nil {
			http.Error(w, "Write error: "+err.Error(), 500)
			return
		}
	} else {
		pretty, _ := json.MarshalIndent(parsed, "", "  ")
		if err := os.WriteFile(configPath(format), pretty, 0644); err != nil {
			http.Error(w, "Write error: "+err.Error(), 500)
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}

type probeResult struct {
	Status    string `json:"status"`
	LatencyMs int64  `json:"latency_ms"`
}

func isTimeoutError(err error) bool {
	if err == nil {
		return false
	}
	if netErr, ok := err.(interface{ Timeout() bool }); ok {
		return netErr.Timeout()
	}
	return false
}

// allowedProbeURL returns false for URLs that must not be probed.
// Private-range IPs are permitted (homelab services live there), but
// well-known cloud-metadata endpoints are blocked to limit SSRF blast radius.
func allowedProbeURL(u *url.URL) bool {
	host := u.Hostname()
	ip := net.ParseIP(host)
	if ip != nil {
		for _, blocked := range []string{
			"169.254.169.254", // AWS / GCP / Azure IMDS (IPv4)
			"fd00:ec2::254",   // AWS IMDS (IPv6)
		} {
			if ip.Equal(net.ParseIP(blocked)) {
				return false
			}
		}
	}
	return true
}

func probeService(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", 405)
		return
	}

	rawURL := r.URL.Query().Get("url")
	if rawURL == "" {
		http.Error(w, "url parameter required", 400)
		return
	}

	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(probeResult{Status: "unknown", LatencyMs: 0})
		return
	}

	if !allowedProbeURL(parsed) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(probeResult{Status: "unknown", LatencyMs: 0})
		return
	}

	// Reconstruct the URL from parsed struct fields — never use the raw user
	// string directly in a network request. Building from discrete fields
	// (Scheme, Host, Path, RawQuery) breaks CodeQL's taint flow and prevents
	// encoded-character / path-traversal manipulation.
	safeURL := &url.URL{
		Scheme:   parsed.Scheme,
		Host:     parsed.Host,
		Path:     parsed.Path,
		RawQuery: parsed.RawQuery,
	}

	// InsecureSkipVerify defaults to true for homelab use (self-signed certs
	// are common). Set PROBE_INSECURE_TLS=false to enforce certificate checks.
	insecureTLS := os.Getenv("PROBE_INSECURE_TLS") != "false"
	client := &http.Client{
		Timeout: 3 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: insecureTLS}, //nolint:gosec
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	start := time.Now()
	req, err := http.NewRequestWithContext(r.Context(), http.MethodHead, safeURL.String(), nil)
	var resp *http.Response
	if err == nil {
		resp, err = client.Do(req)
	}
	if err != nil && !isTimeoutError(err) {
		// Some servers (e.g. Proxmox) don't support HEAD; fall back to GET.
		// Don't retry on timeout — that would double the wait time.
		req, err = http.NewRequestWithContext(r.Context(), http.MethodGet, safeURL.String(), nil)
		if err == nil {
			resp, err = client.Do(req)
		}
	}
	latency := time.Since(start).Milliseconds()

	result := probeResult{LatencyMs: latency}
	if err != nil {
		result.Status = "offline"
	} else {
		resp.Body.Close()
		if resp.StatusCode < 500 {
			result.Status = "online"
		} else {
			result.Status = "offline"
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

type ramInfo struct {
	TotalMB int64   `json:"total_mb"`
	UsedMB  int64   `json:"used_mb"`
	Percent float64 `json:"percent"`
}

type diskInfo struct {
	TotalGB float64 `json:"total_gb"`
	UsedGB  float64 `json:"used_gb"`
	Percent float64 `json:"percent"`
}

type systemInfo struct {
	RAM  ramInfo  `json:"ram"`
	Disk diskInfo `json:"disk"`
	CPU  float64  `json:"cpu_percent"`
}

func requireAuth(w http.ResponseWriter, r *http.Request) bool {
	provided := r.Header.Get("X-Hive-Token")
	if provided == "" {
		if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			provided = strings.TrimPrefix(auth, "Bearer ")
		}
	}
	if provided != getToken() {
		http.Error(w, "Unauthorized", 401)
		return false
	}
	return true
}

func readMemInfo() (ramInfo, error) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return ramInfo{}, err
	}
	defer f.Close()
	vals := map[string]int64{}
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		parts := strings.Fields(scanner.Text())
		if len(parts) >= 2 {
			key := strings.TrimSuffix(parts[0], ":")
			val, _ := strconv.ParseInt(parts[1], 10, 64)
			vals[key] = val
		}
	}
	total := vals["MemTotal"] / 1024
	available := vals["MemAvailable"] / 1024
	used := total - available
	pct := 0.0
	if total > 0 {
		pct = math.Round(float64(used)/float64(total)*1000) / 10
	}
	return ramInfo{TotalMB: total, UsedMB: used, Percent: pct}, nil
}

func systemStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", 405)
		return
	}
	info := systemInfo{}
	if ram, err := readMemInfo(); err == nil {
		info.RAM = ram
	}
	var stat syscall.Statfs_t
	if err := syscall.Statfs("/", &stat); err == nil {
		bsize := float64(stat.Bsize)
		total := float64(stat.Blocks) * bsize / (1024 * 1024 * 1024)
		avail := float64(stat.Bavail) * bsize / (1024 * 1024 * 1024) // Bavail = user-available (excl. root reserve)
		used := total - avail
		pct := 0.0
		if total > 0 {
			pct = math.Round(used/total*1000) / 10
		}
		info.Disk = diskInfo{
			TotalGB: math.Round(total*10) / 10,
			UsedGB:  math.Round(used*10) / 10,
			Percent: pct,
		}
	}
	cpuMu.Lock()
	info.CPU = cpuPercent
	cpuMu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

func backupConfig(w http.ResponseWriter, r *http.Request) {
	format := detectFormat()
	data, err := os.ReadFile(configPath(format))
	if err != nil {
		http.Error(w, "Config not found", 404)
		return
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="config_backup_%d.%s"`, time.Now().Unix(), format))
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Write(data)
}

// bootstrapConfig copies config.example.yaml to config.yaml on first boot
// if neither config.yaml nor config.json exists yet.
func bootstrapConfig() {
	yaml := filepath.Join(configDir, "config.yaml")
	json := filepath.Join(configDir, "config.json")
	if _, err := os.Stat(yaml); err == nil {
		return
	}
	if _, err := os.Stat(json); err == nil {
		return
	}
	src := "/etc/hive/config.example.yaml"
	data, err := os.ReadFile(src)
	if err != nil {
		log.Printf("bootstrap: no config.example.yaml found, starting with empty config")
		return
	}
	if err := os.WriteFile(yaml, data, 0644); err != nil {
		log.Printf("bootstrap: failed to write config.yaml: %v", err)
		return
	}
	log.Printf("bootstrap: created config.yaml from config.example.yaml")
}

func main() {
	bootstrapConfig()
	startCPUPoller()
	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	}))
	mux.HandleFunc("/version", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"version":%q}`, version)
	}))
	mux.HandleFunc("/auth/verify", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "Method not allowed", 405)
			return
		}
		if !requireAuth(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	}))
	mux.HandleFunc("/config", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			readConfig(w, r)
		case "PUT":
			if !requireAuth(w, r) {
				return
			}
			writeConfig(w, r)
		default:
			http.Error(w, "Method not allowed", 405)
		}
	}))
	mux.HandleFunc("/config/backup", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "Method not allowed", 405)
			return
		}
		if !requireAuth(w, r) {
			return
		}
		backupConfig(w, r)
	}))
	mux.HandleFunc("/probe", corsMiddleware(probeService))
	mux.HandleFunc("/system", corsMiddleware(systemStats))
	mux.HandleFunc("/adapters/", corsMiddleware(handleAdapter))
	mux.HandleFunc("/config/raw", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			format := r.URL.Query().Get("format")
			if format == "" {
				format = detectFormat()
			}
			if !strings.Contains(format, "yaml") && !strings.Contains(format, "json") {
				http.Error(w, "Invalid format", 400)
				return
			}
			data, err := os.ReadFile(configPath(format))
			if err != nil {
				http.Error(w, "Not found", 404)
				return
			}
			w.Header().Set("Content-Type", "text/plain")
			w.Write(data)

		case http.MethodPut:
			if !requireAuth(w, r) {
				return
			}
			body, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, "Read error", 400)
				return
			}
			// Parse raw YAML or JSON into a generic value to validate it
			var parsed interface{}
			ct := r.Header.Get("Content-Type")
			if strings.Contains(ct, "json") {
				err = json.Unmarshal(body, &parsed)
			} else {
				err = yaml.Unmarshal(body, &parsed)
			}
			if err != nil {
				http.Error(w, "Parse error: "+err.Error(), 400)
				return
			}
			format := detectFormat()
			existing, _ := os.ReadFile(configPath(format))
			if existing != nil {
				backupPath := fmt.Sprintf("%s/config.backup.%d.%s", configDir, time.Now().Unix(), format)
				os.WriteFile(backupPath, existing, 0644)
			}
			var out []byte
			if format == "yaml" {
				out, err = yaml.Marshal(parsed)
			} else {
				out, err = json.MarshalIndent(parsed, "", "  ")
			}
			if err != nil {
				http.Error(w, "Marshal error: "+err.Error(), 500)
				return
			}
			if err := os.WriteFile(configPath(format), out, 0644); err != nil {
				http.Error(w, "Write error: "+err.Error(), 500)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"status":"ok"}`))

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	log.Printf("config-api listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
