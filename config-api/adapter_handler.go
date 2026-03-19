package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/beedevz/hive-api/adapters"
	"gopkg.in/yaml.v3"
)

// ─── Config structs ───────────────────────────────────────────────

type serviceItem struct {
	Name          string                 `yaml:"name" json:"name"`
	URL           string                 `yaml:"url"  json:"url"`
	Adapter       string                 `yaml:"adapter"        json:"adapter"`
	AdapterConfig map[string]interface{} `yaml:"adapter_config" json:"adapter_config"`
}

type serviceCategory struct {
	Category string        `yaml:"category"`
	Items    []serviceItem `yaml:"items"`
}

type hiveConfig struct {
	Services []serviceCategory `yaml:"services"`
}

// ─── Config helpers ───────────────────────────────────────────────

func readFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}

func unmarshalConfig(format string, data []byte, dest interface{}) error {
	if format == "yaml" {
		return yaml.Unmarshal(data, dest)
	}
	return json.Unmarshal(data, dest)
}

// findServiceByName loads config and returns the first service whose name
// matches case-insensitively. Used by /probe/{name}/* endpoints.
func findServiceByName(name string) (*serviceItem, error) {
	format := detectFormat()
	data, err := readFile(configPath(format))
	if err != nil {
		return nil, err
	}
	var cfg hiveConfig
	if err := unmarshalConfig(format, data, &cfg); err != nil {
		return nil, err
	}
	nameLower := strings.ToLower(name)
	for _, cat := range cfg.Services {
		for i, svc := range cat.Items {
			if strings.ToLower(svc.Name) == nameLower {
				cp := cat.Items[i]
				return &cp, nil
			}
		}
	}
	return nil, nil
}

// findService loads config and returns the service matching name+adapterType.
// Prefers the entry whose adapter field matches adapterType to resolve duplicate names.
func findService(name, adapterType string) (*serviceItem, error) {
	format := detectFormat()
	data, err := readFile(configPath(format))
	if err != nil {
		return nil, err
	}
	var cfg hiveConfig
	if err := unmarshalConfig(format, data, &cfg); err != nil {
		return nil, err
	}
	var fallback *serviceItem
	for _, cat := range cfg.Services {
		for i, svc := range cat.Items {
			if svc.Name != name {
				continue
			}
			if svc.Adapter == adapterType {
				cp := cat.Items[i]
				return &cp, nil
			}
			if fallback == nil {
				cp := cat.Items[i]
				fallback = &cp
			}
		}
	}
	return fallback, nil
}

// ─── HTTP handler ─────────────────────────────────────────────────

// handleAdapter godoc
// @Summary     Run adapter for a service
// @Description Fetches live stats from the named adapter for the given service. Results are cached for 60 s.
// @Tags        adapters
// @Param       type    path  string true "Adapter type (e.g. pihole, proxmox, sonarr)"
// @Param       service query string true "Service name as defined in config"
// @Produce     json
// @Success     200 {object} object "AdapterResult with stats array"
// @Failure     400 {string} string "Missing adapter type or service parameter"
// @Failure     405 {string} string "Method not allowed"
// @Router      /adapters/{type} [get]
func handleAdapter(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	adapterType := strings.TrimPrefix(r.URL.Path, "/adapters/")
	adapterType = strings.Trim(adapterType, "/")
	if adapterType == "" {
		http.Error(w, "adapter type required in path", http.StatusBadRequest)
		return
	}

	rawName := r.URL.Query().Get("service")
	if rawName == "" {
		http.Error(w, "service parameter required", http.StatusBadRequest)
		return
	}
	serviceName, err := url.QueryUnescape(rawName)
	if err != nil {
		http.Error(w, "invalid service name", http.StatusBadRequest)
		return
	}

	cacheKey := adapterType + ":" + serviceName

	if cached, ok := adapters.GetCached(cacheKey); ok {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "HIT")
		json.NewEncoder(w).Encode(cached)
		return
	}

	svc, err := findService(serviceName, adapterType)
	if err != nil {
		writeJSON(w, adapters.ErrResult(adapterType, "config read error: "+err.Error()))
		return
	}
	if svc == nil {
		writeJSON(w, adapters.ErrResult(adapterType, "service not found: "+serviceName))
		return
	}

	cfg := adapters.ExpandEnvVars(svc.AdapterConfig, loadSecrets())

	baseURL := svc.URL
	if u, ok := cfg["api_url"].(string); ok && u != "" {
		baseURL = u
	}
	baseURL = strings.TrimRight(baseURL, "/")

	result := adapters.Run(adapterType, cfg, baseURL)

	if result.Ok {
		adapters.SetCached(cacheKey, result)
	}

	writeJSON(w, result)
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
