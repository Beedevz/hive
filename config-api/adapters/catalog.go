package adapters

const iconBase = "https://cdn.jsdelivr.net/gh/selfhst/icons/svg/"

// FieldDef describes a single configuration field for an adapter.
type FieldDef struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Type        string `json:"type,omitempty"`        // text (default) | number | password
	Placeholder string `json:"placeholder,omitempty"`
	Hint        string `json:"hint,omitempty"`
}

// AdapterDef is the catalog entry for one adapter type.
type AdapterDef struct {
	Key    string     `json:"key"`
	Label  string     `json:"label"`
	Icon   string     `json:"icon"`
	Fields []FieldDef `json:"fields"`
}

func si(name string) string { return iconBase + name }

// Catalog is the authoritative list of adapter types served to the frontend.
var Catalog = []AdapterDef{
	{Key: "", Label: "None", Icon: "", Fields: []FieldDef{}},

	// ── Monitoring ──────────────────────────────────────────────────
	{Key: "adguard", Label: "AdGuard Home", Icon: si("adguard-home.svg"), Fields: []FieldDef{
		{Key: "username", Label: "Username", Placeholder: "${ADGUARD_USER}"},
		{Key: "password", Label: "Password", Placeholder: "${ADGUARD_PASS}"},
	}},
	{Key: "pihole", Label: "Pi-hole", Icon: si("pi-hole.svg"), Fields: []FieldDef{
		{Key: "token", Label: "API Token (optional)", Placeholder: "${PIHOLE_TOKEN}"},
	}},
	{Key: "grafana", Label: "Grafana", Icon: si("grafana.svg"), Fields: []FieldDef{
		{Key: "token", Label: "Service Account Token", Placeholder: "${GRAFANA_TOKEN}"},
	}},
	{Key: "netdata", Label: "Netdata", Icon: si("netdata.svg"), Fields: []FieldDef{}},
	{Key: "uptime-kuma", Label: "Uptime Kuma", Icon: si("uptime-kuma.svg"), Fields: []FieldDef{
		{Key: "username", Label: "Username", Placeholder: "${UPTIMEKUMA_USER}"},
		{Key: "password", Label: "Password", Placeholder: "${UPTIMEKUMA_PASS}", Type: "password"},
	}},

	// ── Infrastructure ───────────────────────────────────────────────
	{Key: "proxmox", Label: "Proxmox", Icon: si("proxmox.svg"), Fields: []FieldDef{
		{Key: "token", Label: "API Token", Placeholder: "${PROXMOX_TOKEN}", Hint: "Format: USER@REALM!TOKENID=SECRET"},
	}},
	{Key: "portainer", Label: "Portainer", Icon: si("portainer.svg"), Fields: []FieldDef{
		{Key: "token", Label: "API Key", Placeholder: "${PORTAINER_TOKEN}"},
	}},
	{Key: "traefik", Label: "Traefik", Icon: si("traefik.svg"), Fields: []FieldDef{
		{Key: "username", Label: "Username (optional)", Placeholder: "${TRAEFIK_USER}"},
		{Key: "password", Label: "Password (optional)", Placeholder: "${TRAEFIK_PASS}"},
	}},
	{Key: "npm", Label: "Nginx Proxy Manager", Icon: si("nginx-proxy-manager.svg"), Fields: []FieldDef{
		{Key: "username", Label: "Username / E-mail", Placeholder: "${NPM_USER}"},
		{Key: "password", Label: "Password", Placeholder: "${NPM_PASS}"},
	}},

	// ── Media ────────────────────────────────────────────────────────
	{Key: "jellyfin", Label: "Jellyfin", Icon: si("jellyfin.svg"), Fields: []FieldDef{
		{Key: "token", Label: "API Key", Placeholder: "${JELLYFIN_TOKEN}"},
	}},
	{Key: "plex", Label: "Plex", Icon: si("plex.svg"), Fields: []FieldDef{
		{Key: "token", Label: "X-Plex-Token", Placeholder: "${PLEX_TOKEN}"},
	}},
	{Key: "sonarr", Label: "Sonarr", Icon: si("sonarr.svg"), Fields: []FieldDef{
		{Key: "apikey", Label: "API Key", Placeholder: "${SONARR_APIKEY}"},
	}},
	{Key: "radarr", Label: "Radarr", Icon: si("radarr.svg"), Fields: []FieldDef{
		{Key: "apikey", Label: "API Key", Placeholder: "${RADARR_APIKEY}"},
	}},
	{Key: "qbittorrent", Label: "qBittorrent", Icon: si("qbittorrent.svg"), Fields: []FieldDef{
		{Key: "username", Label: "Username", Placeholder: "${QB_USER}"},
		{Key: "password", Label: "Password", Placeholder: "${QB_PASS}", Type: "password"},
	}},

	// ── Services ─────────────────────────────────────────────────────
	{Key: "nextcloud", Label: "Nextcloud", Icon: si("nextcloud.svg"), Fields: []FieldDef{
		{Key: "username", Label: "Admin Username", Placeholder: "${NC_USER}"},
		{Key: "password", Label: "Password", Placeholder: "${NC_PASS}", Type: "password"},
	}},
	{Key: "immich", Label: "Immich", Icon: si("immich.svg"), Fields: []FieldDef{
		{Key: "apikey", Label: "API Key", Placeholder: "${IMMICH_APIKEY}"},
	}},
	{Key: "vaultwarden", Label: "Vaultwarden", Icon: si("vaultwarden.svg"), Fields: []FieldDef{}},
	{Key: "homeassistant", Label: "Home Assistant", Icon: si("home-assistant.svg"), Fields: []FieldDef{
		{Key: "token", Label: "Long-Lived Access Token", Placeholder: "${HASS_TOKEN}"},
	}},

	// ── Arr stack ────────────────────────────────────────────────────
	{Key: "lidarr", Label: "Lidarr", Icon: si("lidarr.svg"), Fields: []FieldDef{
		{Key: "apikey", Label: "API Key", Placeholder: "${LIDARR_APIKEY}"},
	}},
	{Key: "readarr", Label: "Readarr", Icon: si("readarr.svg"), Fields: []FieldDef{
		{Key: "apikey", Label: "API Key", Placeholder: "${READARR_APIKEY}"},
	}},
	{Key: "prowlarr", Label: "Prowlarr", Icon: si("prowlarr.svg"), Fields: []FieldDef{
		{Key: "apikey", Label: "API Key", Placeholder: "${PROWLARR_APIKEY}"},
	}},
	{Key: "bazarr", Label: "Bazarr", Icon: si("bazarr.svg"), Fields: []FieldDef{
		{Key: "apikey", Label: "API Key", Placeholder: "${BAZARR_APIKEY}"},
	}},
	{Key: "emby", Label: "Emby", Icon: si("emby.svg"), Fields: []FieldDef{
		{Key: "token", Label: "API Key", Placeholder: "${EMBY_TOKEN}"},
	}},
	{Key: "overseerr", Label: "Overseerr", Icon: si("overseerr.svg"), Fields: []FieldDef{
		{Key: "apikey", Label: "API Key", Placeholder: "${OVERSEERR_APIKEY}"},
	}},
	{Key: "jellyseerr", Label: "Jellyseerr", Icon: si("jellyseerr.svg"), Fields: []FieldDef{
		{Key: "apikey", Label: "API Key", Placeholder: "${JELLYSEERR_APIKEY}"},
	}},

	// ── Download ─────────────────────────────────────────────────────
	{Key: "sabnzbd", Label: "SABnzbd", Icon: si("sabnzbd.svg"), Fields: []FieldDef{
		{Key: "apikey", Label: "API Key", Placeholder: "${SABNZBD_APIKEY}"},
	}},
	{Key: "nzbget", Label: "NZBGet", Icon: si("nzbget.svg"), Fields: []FieldDef{
		{Key: "username", Label: "Username", Placeholder: "${NZBGET_USER}"},
		{Key: "password", Label: "Password", Placeholder: "${NZBGET_PASS}", Type: "password"},
	}},
	{Key: "transmission", Label: "Transmission", Icon: si("transmission.svg"), Fields: []FieldDef{
		{Key: "username", Label: "Username", Placeholder: "${TR_USER}"},
		{Key: "password", Label: "Password", Placeholder: "${TR_PASS}", Type: "password"},
	}},
	{Key: "deluge", Label: "Deluge", Icon: si("deluge.svg"), Fields: []FieldDef{
		{Key: "password", Label: "Password", Placeholder: "${DELUGE_PASS}", Type: "password"},
	}},

	// ── System ───────────────────────────────────────────────────────
	{Key: "glances", Label: "Glances", Icon: si("glances.svg"), Fields: []FieldDef{}},
	{Key: "truenas", Label: "TrueNAS", Icon: si("truenas.svg"), Fields: []FieldDef{
		{Key: "apikey", Label: "API Key", Placeholder: "${TRUENAS_APIKEY}"},
	}},
	{Key: "scrutiny", Label: "Scrutiny", Icon: si("scrutiny.svg"), Fields: []FieldDef{}},
	{Key: "synology", Label: "Synology DSM", Icon: si("synology.svg"), Fields: []FieldDef{
		{Key: "username", Label: "Username", Placeholder: "${SYNO_USER}"},
		{Key: "password", Label: "Password", Placeholder: "${SYNO_PASS}", Type: "password"},
	}},
	{Key: "unifi", Label: "UniFi", Icon: si("ubiquiti.svg"), Fields: []FieldDef{
		{Key: "username", Label: "Username", Placeholder: "${UNIFI_USER}"},
		{Key: "password", Label: "Password", Placeholder: "${UNIFI_PASS}", Type: "password"},
		{Key: "site", Label: "Site (default: default)", Placeholder: "default"},
	}},
	{Key: "opnsense", Label: "OPNsense", Icon: si("opnsense.svg"), Fields: []FieldDef{
		{Key: "apikey", Label: "API Key", Placeholder: "${OPNS_KEY}"},
		{Key: "apisecret", Label: "API Secret", Placeholder: "${OPNS_SECRET}", Type: "password"},
	}},
	{Key: "frigate", Label: "Frigate NVR", Icon: si("frigate.svg"), Fields: []FieldDef{}},
	{Key: "watchtower", Label: "Watchtower", Icon: si("watchtower.svg"), Fields: []FieldDef{
		{Key: "token", Label: "HTTP API Token", Placeholder: "${WATCHTOWER_TOKEN}"},
	}},

	// ── Storage ───────────────────────────────────────────────────────
	{Key: "wdmycloud", Label: "WD My Cloud", Icon: si("western-digital.svg"), Fields: []FieldDef{
		{Key: "username", Label: "Username", Placeholder: "${WD_USER}"},
		{Key: "password", Label: "Password", Placeholder: "${WD_PASS}", Type: "password"},
	}},

	// ── Dev & Tools ──────────────────────────────────────────────────
	{Key: "gitlab", Label: "GitLab", Icon: si("gitlab.svg"), Fields: []FieldDef{
		{Key: "token", Label: "Token", Placeholder: "${GITLAB_TOKEN}"},
	}},
	{Key: "gitea", Label: "Gitea", Icon: si("gitea.svg"), Fields: []FieldDef{
		{Key: "token", Label: "API Token", Placeholder: "${GITEA_TOKEN}"},
	}},
	{Key: "forgejo", Label: "Forgejo", Icon: si("forgejo.svg"), Fields: []FieldDef{
		{Key: "token", Label: "API Token", Placeholder: "${FORGEJO_TOKEN}"},
	}},
	{Key: "paperless", Label: "Paperless-ngx", Icon: si("paperless-ngx.svg"), Fields: []FieldDef{
		{Key: "token", Label: "API Token", Placeholder: "${PAPERLESS_TOKEN}"},
	}},
	{Key: "firefly", Label: "Firefly III", Icon: si("firefly-iii.svg"), Fields: []FieldDef{
		{Key: "token", Label: "Personal Access Token", Placeholder: "${FIREFLY_TOKEN}"},
	}},
	{Key: "speedtest", Label: "Speedtest Tracker", Icon: si("speedtest-tracker.svg"), Fields: []FieldDef{}},

	// ── Network ──────────────────────────────────────────────────────
	{Key: "cloudflare", Label: "Cloudflare Tunnels", Icon: si("cloudflare.svg"), Fields: []FieldDef{
		{Key: "apikey", Label: "API Token", Placeholder: "${CF_TOKEN}"},
		{Key: "accountid", Label: "Account ID", Placeholder: "${CF_ACCOUNT_ID}"},
	}},
	{Key: "tailscale", Label: "Tailscale", Icon: si("tailscale.svg"), Fields: []FieldDef{
		{Key: "apikey", Label: "API Key", Placeholder: "${TS_APIKEY}"},
		{Key: "tailnet", Label: "Tailnet", Placeholder: "${TS_TAILNET}"},
	}},
}
