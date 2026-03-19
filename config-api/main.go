package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/beedevz/hive-api/adapters"
	"gopkg.in/yaml.v3"
)

const configDir = "/config"
const secretsFile = "/config/secrets.yaml"

// loadSecrets reads secrets.yaml and returns a key→value map.
// Returns an empty map if the file does not exist or cannot be parsed.
func loadSecrets() map[string]string {
	data, err := os.ReadFile(secretsFile)
	if err != nil {
		return map[string]string{}
	}
	var s map[string]string
	if err := yaml.Unmarshal(data, &s); err != nil {
		return map[string]string{}
	}
	if s == nil {
		return map[string]string{}
	}
	return s
}

func saveSecrets(s map[string]string) error {
	data, err := yaml.Marshal(s)
	if err != nil {
		return err
	}
	return os.WriteFile(secretsFile, data, 0600)
}

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

// validNameRe allows letters, digits, spaces, hyphens and underscores (1-64 chars).
// These are the only characters permitted in a service name so that names are
// safe to embed in URL path segments without ambiguity.
var validNameRe = regexp.MustCompile(`^[a-zA-Z0-9 _-]{1,64}$`)

func isValidServiceName(name string) bool {
	return validNameRe.MatchString(name)
}

// probeClient builds the shared HTTP client used by status checks.
// InsecureSkipVerify defaults to true for homelab use (self-signed certs are
// common). Set PROBE_INSECURE_TLS=false to enforce certificate verification.
func probeClient() *http.Client {
	insecureTLS := os.Getenv("PROBE_INSECURE_TLS") != "false"
	return &http.Client{
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
}

// handleProbe routes /probe/{name}/status and /probe/{name}/details.
// The service URL is always read from config — it never comes from the caller.
func handleProbe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", 405)
		return
	}

	// Path after "/probe/": "{name}/status" or "{name}/details"
	rest := strings.TrimPrefix(r.URL.Path, "/probe/")
	slash := strings.LastIndex(rest, "/")
	if slash == -1 {
		http.Error(w, "invalid path — expected /probe/{name}/status or /probe/{name}/details", 400)
		return
	}

	rawName := rest[:slash]
	action := rest[slash+1:]

	if action != "status" && action != "details" {
		http.Error(w, "invalid action — expected 'status' or 'details'", 400)
		return
	}

	name, err := url.PathUnescape(rawName)
	if err != nil || !isValidServiceName(name) {
		http.Error(w, "invalid service name — allowed: letters, digits, spaces, hyphens, underscores (max 64 chars)", 400)
		return
	}

	svc, err := findServiceByName(name)
	if err != nil {
		http.Error(w, "config read error", 500)
		return
	}
	if svc == nil {
		http.Error(w, "service not found: "+name, 404)
		return
	}

	switch action {
	case "status":
		handleProbeStatus(w, r, svc)
	case "details":
		handleProbeDetails(w, r, svc)
	}
}

// handleProbeStatus returns online/offline/unknown for a service.
// For services with an adapter: uses the cached adapter result so that
// authenticated APIs (e.g. Proxmox) are not probed over plain HTTP.
// Falls back to HEAD/GET probe when no adapter cache is available.
func handleProbeStatus(w http.ResponseWriter, r *http.Request, svc *serviceItem) {
	if result, ok := adapterCacheStatus(svc); ok {
		writeJSON(w, result)
		return
	}
	writeJSON(w, httpProbeStatus(r, svc))
}

// adapterCacheStatus returns the cached adapter result as a probeResult.
// Returns (result, true) if the adapter has a cached entry, (zero, false) otherwise.
func adapterCacheStatus(svc *serviceItem) (probeResult, bool) {
	if svc.Adapter == "" {
		return probeResult{}, false
	}
	cached, ok := adapters.GetCached(svc.Adapter + ":" + svc.Name)
	if !ok {
		return probeResult{}, false
	}
	status := "offline"
	if cached.Ok {
		status = "online"
	}
	return probeResult{Status: status, LatencyMs: -1}, true
}

// httpProbeStatus performs a HEAD (fallback GET) against the service URL.
func httpProbeStatus(r *http.Request, svc *serviceItem) probeResult {
	unknown := probeResult{Status: "unknown", LatencyMs: 0}

	if svc.URL == "" {
		return unknown
	}
	parsed, err := url.Parse(svc.URL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return unknown
	}
	safeURL := &url.URL{
		Scheme:   parsed.Scheme,
		Host:     parsed.Host,
		Path:     parsed.Path,
		RawQuery: parsed.RawQuery,
	}

	client := probeClient()
	start := time.Now()

	resp, err := doProbeRequest(r.Context(), client, http.MethodHead, safeURL.String())
	if err != nil && !isTimeoutError(err) {
		// Some servers don't support HEAD; fall back to GET.
		resp, err = doProbeRequest(r.Context(), client, http.MethodGet, safeURL.String())
	}
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return probeResult{Status: "offline", LatencyMs: latency}
	}
	resp.Body.Close()
	if resp.StatusCode < 500 {
		return probeResult{Status: "online", LatencyMs: latency}
	}
	return probeResult{Status: "offline", LatencyMs: latency}
}

func doProbeRequest(ctx context.Context, client *http.Client, method, rawURL string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, rawURL, nil)
	if err != nil {
		return nil, err
	}
	return client.Do(req)
}

// handleProbeDetails delegates to the service's configured adapter and returns
// widget stats. Returns an error result if no adapter is configured.
func handleProbeDetails(w http.ResponseWriter, r *http.Request, svc *serviceItem) {
	if svc.Adapter == "" {
		writeJSON(w, adapters.ErrResult("none", "no adapter configured for this service"))
		return
	}

	cacheKey := svc.Adapter + ":" + svc.Name
	if cached, ok := adapters.GetCached(cacheKey); ok {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "HIT")
		json.NewEncoder(w).Encode(cached)
		return
	}

	cfg := adapters.ExpandEnvVars(svc.AdapterConfig, loadSecrets())
	baseURL := svc.URL
	if u, ok := cfg["api_url"].(string); ok && u != "" {
		baseURL = u
	}
	baseURL = strings.TrimRight(baseURL, "/")

	result := adapters.Run(svc.Adapter, cfg, baseURL)
	if result.Ok {
		adapters.SetCached(cacheKey, result)
	}

	writeJSON(w, result)
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
	mux.HandleFunc("/logo", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			customLogo := filepath.Join(configDir, "logo.png")
			if _, err := os.Stat(customLogo); err == nil {
				http.ServeFile(w, r, customLogo)
				return
			}
			theme := r.URL.Query().Get("theme")
			if theme != "light" {
				theme = "dark"
			}
			themedLogo := "/usr/share/nginx/html/logo-" + theme + ".png"
			if _, err := os.Stat(themedLogo); err == nil {
				http.ServeFile(w, r, themedLogo)
				return
			}
			http.ServeFile(w, r, "/usr/share/nginx/html/logo.png")
		case http.MethodPost:
			if !requireAuth(w, r) {
				return
			}
			if err := r.ParseMultipartForm(5 << 20); err != nil {
				http.Error(w, "File too large (max 5MB)", 400)
				return
			}
			file, header, err := r.FormFile("logo")
			if err != nil {
				http.Error(w, "Missing file field 'logo'", 400)
				return
			}
			defer file.Close()
			ct := header.Header.Get("Content-Type")
			allowed := map[string]bool{"image/png": true, "image/jpeg": true, "image/svg+xml": true, "image/webp": true, "image/gif": true}
			if !allowed[ct] {
				// Fallback: check first 512 bytes
				buf := make([]byte, 512)
				n, _ := file.Read(buf)
				detected := http.DetectContentType(buf[:n])
				if !allowed[detected] {
					http.Error(w, "Unsupported image type", 415)
					return
				}
				// Seek back to start
				if seeker, ok := file.(io.Seeker); ok {
					seeker.Seek(0, io.SeekStart)
				}
			}
			dst, err := os.OpenFile(filepath.Join(configDir, "logo.png"), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
			if err != nil {
				http.Error(w, "Write error: "+err.Error(), 500)
				return
			}
			_, copyErr := io.Copy(dst, file)
			closeErr := dst.Close()
			if copyErr != nil {
				http.Error(w, "Write error: "+copyErr.Error(), 500)
				return
			}
			if closeErr != nil {
				http.Error(w, "Write error: "+closeErr.Error(), 500)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"status":"ok"}`))
		case http.MethodDelete:
			if !requireAuth(w, r) {
				return
			}
			customLogo := filepath.Join(configDir, "logo.png")
			if err := os.Remove(customLogo); err != nil && !os.IsNotExist(err) {
				http.Error(w, "Delete error: "+err.Error(), 500)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"status":"ok"}`))
		default:
			http.Error(w, "Method not allowed", 405)
		}
	}))
	mux.HandleFunc("/secrets", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if !requireAuth(w, r) {
			return
		}
		switch r.Method {
		case http.MethodGet:
			s := loadSecrets()
			keys := make([]string, 0, len(s))
			for k := range s {
				keys = append(keys, k)
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"keys": keys})

		case http.MethodPut:
			var body struct {
				Key   string `json:"key"`
				Value string `json:"value"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Key == "" {
				http.Error(w, "Invalid body: key and value required", 400)
				return
			}
			s := loadSecrets()
			s[body.Key] = body.Value
			if err := saveSecrets(s); err != nil {
				http.Error(w, "Write error: "+err.Error(), 500)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"status":"ok"}`))

		case http.MethodDelete:
			key := r.URL.Query().Get("key")
			if key == "" {
				http.Error(w, "Missing ?key=", 400)
				return
			}
			s := loadSecrets()
			delete(s, key)
			if err := saveSecrets(s); err != nil {
				http.Error(w, "Write error: "+err.Error(), 500)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"status":"ok"}`))

		default:
			http.Error(w, "Method not allowed", 405)
		}
	}))
	mux.HandleFunc("/secrets/backup", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if !requireAuth(w, r) {
			return
		}
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", 405)
			return
		}
		data, err := os.ReadFile(secretsFile)
		if err != nil {
			http.Error(w, "No secrets file found", 404)
			return
		}
		w.Header().Set("Content-Type", "application/x-yaml")
		w.Header().Set("Content-Disposition", "attachment; filename=secrets.yaml")
		w.Write(data)
	}))
	mux.HandleFunc("/secrets/import", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if !requireAuth(w, r) {
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", 405)
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Read error", 400)
			return
		}
		var incoming map[string]string
		if err := yaml.Unmarshal(body, &incoming); err != nil || incoming == nil {
			http.Error(w, "Invalid YAML", 400)
			return
		}
		existing := loadSecrets()
		for k, v := range incoming {
			existing[k] = v
		}
		if err := saveSecrets(existing); err != nil {
			http.Error(w, "Write error: "+err.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	}))
	mux.HandleFunc("/probe/", corsMiddleware(handleProbe))
	mux.HandleFunc("/system", corsMiddleware(systemStats))
	mux.HandleFunc("/adapters/", corsMiddleware(handleAdapter))
	mux.HandleFunc("/adapters-catalog", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(adapters.Catalog)
	}))
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
