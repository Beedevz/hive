package adapters

// Run dispatches to the correct adapter function.
func Run(adapterType string, cfg map[string]interface{}, serviceURL string) AdapterResult {
	switch adapterType {
	case "gitlab":
		return fetchGitLabStats(cfg, serviceURL)
	case "portainer":
		return fetchPortainerStats(cfg, serviceURL)
	case "proxmox":
		return fetchProxmoxStats(cfg, serviceURL)
	case "adguard":
		return fetchAdGuardStats(cfg, serviceURL)
	case "npm":
		return fetchNPMStats(cfg, serviceURL)
	case "grafana":
		return fetchGrafanaStats(cfg, serviceURL)
	case "uptime-kuma":
		return fetchUptimeKumaStats(cfg, serviceURL)
	case "jellyfin":
		return fetchJellyfinStats(cfg, serviceURL)
	case "sonarr":
		return fetchSonarrStats(cfg, serviceURL)
	case "radarr":
		return fetchRadarrStats(cfg, serviceURL)
	case "qbittorrent":
		return fetchQBittorrentStats(cfg, serviceURL)
	case "nextcloud":
		return fetchNextcloudStats(cfg, serviceURL)
	case "immich":
		return fetchImmichStats(cfg, serviceURL)
	case "vaultwarden":
		return fetchVaultwardenStats(cfg, serviceURL)
	case "traefik":
		return fetchTraefikStats(cfg, serviceURL)
	case "netdata":
		return fetchNetdataStats(cfg, serviceURL)
	case "plex":
		return fetchPlexStats(cfg, serviceURL)
	case "homeassistant":
		return fetchHomeAssistantStats(cfg, serviceURL)
	case "pihole":
		return fetchPiholeStats(cfg, serviceURL)
	case "wdmycloud":
		return fetchWDMyCloudStats(cfg, serviceURL)
	case "lidarr":
		return fetchLidarrStats(cfg, serviceURL)
	case "readarr":
		return fetchReadarrStats(cfg, serviceURL)
	case "prowlarr":
		return fetchProwlarrStats(cfg, serviceURL)
	case "bazarr":
		return fetchBazarrStats(cfg, serviceURL)
	case "emby":
		return fetchEmbyStats(cfg, serviceURL)
	case "overseerr", "jellyseerr":
		return fetchOverseerrStats(cfg, serviceURL)
	case "sabnzbd":
		return fetchSABnzbdStats(cfg, serviceURL)
	case "nzbget":
		return fetchNZBgetStats(cfg, serviceURL)
	case "transmission":
		return fetchTransmissionStats(cfg, serviceURL)
	case "glances":
		return fetchGlancesStats(cfg, serviceURL)
	case "truenas":
		return fetchTrueNASStats(cfg, serviceURL)
	case "scrutiny":
		return fetchScrutinyStats(cfg, serviceURL)
	case "gitea", "forgejo":
		return fetchGiteaStats(cfg, serviceURL)
	case "paperless":
		return fetchPaperlessStats(cfg, serviceURL)
	case "speedtest":
		return fetchSpeedtestStats(cfg, serviceURL)
	case "firefly":
		return fetchFireflyStats(cfg, serviceURL)
	case "watchtower":
		return fetchWatchtowerStats(cfg, serviceURL)
	case "deluge":
		return fetchDelugeStats(cfg, serviceURL)
	case "frigate":
		return fetchFrigateStats(cfg, serviceURL)
	case "unifi":
		return fetchUnifiStats(cfg, serviceURL)
	case "opnsense":
		return fetchOPNsenseStats(cfg, serviceURL)
	case "cloudflare":
		return fetchCloudflareTunnelStats(cfg, serviceURL)
	case "tailscale":
		return fetchTailscaleStats(cfg, serviceURL)
	case "synology":
		return fetchSynologyStats(cfg, serviceURL)
	default:
		msg := "unsupported adapter: " + adapterType
		return AdapterResult{Adapter: adapterType, Ok: false, Stats: []StatItem{}, Error: &msg}
	}
}
