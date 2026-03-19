# Adapters

Adapters fetch live stats from your services and display them on service cards. Results are cached for **60 seconds** per service.

## How Adapters Work

1. Add `adapter` and `adapter_config` to a service in `config.yaml`
2. Hive calls `GET /api/adapters/{type}?service={name}` every 60 seconds
3. The backend fetches stats from the service API and returns them
4. The frontend displays stats as badges on the service card

```yaml
services:
  - category: My Services
    items:
      - name: My Service
        url: http://service.local
        adapter: portainer          # adapter type
        adapter_config:
          url: http://service.local # service API url
          token: "${MY_TOKEN}"      # credentials (use env vars)
```

---

## Monitoring & DNS

### adguard
```yaml
adapter: adguard
adapter_config:
  url: http://adguard.local:3000
  username: admin
  password: "${ADGUARD_PASS}"
```

### pihole
```yaml
adapter: pihole
adapter_config:
  url: http://pihole.local
  token: "${PIHOLE_TOKEN}"   # Pi-hole v6: API token from web UI
```

### grafana
```yaml
adapter: grafana
adapter_config:
  url: http://grafana.local:3000
  token: "${GRAFANA_TOKEN}"
```

### netdata
```yaml
adapter: netdata
adapter_config:
  url: http://netdata.local:19999
```

### uptime-kuma
```yaml
adapter: uptime-kuma
adapter_config:
  url: http://uptime-kuma.local:3001
  username: "${UPTIMEKUMA_USER}"
  password: "${UPTIMEKUMA_PASS}"
```

---

## Infrastructure

### portainer
```yaml
adapter: portainer
adapter_config:
  url: http://portainer.local:9000
  token: "${PORTAINER_TOKEN}"
```

### proxmox
```yaml
adapter: proxmox
adapter_config:
  url: https://proxmox.local:8006
  token: "${PROXMOX_TOKEN}"   # format: USER@REALM!TOKENID=SECRET
```

### traefik
```yaml
adapter: traefik
adapter_config:
  url: http://traefik.local:8080
```

### npm
Nginx Proxy Manager
```yaml
adapter: npm
adapter_config:
  url: http://npm.local:81
  username: admin@example.com
  password: "${NPM_PASS}"
```

### glances
```yaml
adapter: glances
adapter_config:
  url: http://glances.local:61208
```

### truenas
```yaml
adapter: truenas
adapter_config:
  url: http://truenas.local
  token: "${TRUENAS_APIKEY}"
```

### scrutiny
```yaml
adapter: scrutiny
adapter_config:
  url: http://scrutiny.local:8080
```

### synology
```yaml
adapter: synology
adapter_config:
  url: http://synology.local:5000
  username: "${SYNO_USER}"
  password: "${SYNO_PASS}"
```

### unifi
```yaml
adapter: unifi
adapter_config:
  url: https://unifi.local
  username: "${UNIFI_USER}"
  password: "${UNIFI_PASS}"
```

### opnsense
```yaml
adapter: opnsense
adapter_config:
  url: https://opnsense.local
  username: "${OPNSENSE_USER}"
  password: "${OPNSENSE_PASS}"
```

### frigate
```yaml
adapter: frigate
adapter_config:
  url: http://frigate.local:5000
```

### watchtower
```yaml
adapter: watchtower
adapter_config:
  url: http://watchtower.local:8080
  token: "${WATCHTOWER_TOKEN}"
```

### wdmycloud
```yaml
adapter: wdmycloud
adapter_config:
  url: http://mycloud.local
  username: "${WD_USER}"
  password: "${WD_PASS}"
```

---

## Media

### jellyfin
```yaml
adapter: jellyfin
adapter_config:
  url: http://jellyfin.local:8096
  token: "${JELLYFIN_TOKEN}"
```

### plex
```yaml
adapter: plex
adapter_config:
  url: http://plex.local:32400
  token: "${PLEX_TOKEN}"
```

### emby
```yaml
adapter: emby
adapter_config:
  url: http://emby.local:8096
  token: "${EMBY_TOKEN}"
```

### sonarr
```yaml
adapter: sonarr
adapter_config:
  url: http://sonarr.local:8989
  token: "${SONARR_APIKEY}"
```

### radarr
```yaml
adapter: radarr
adapter_config:
  url: http://radarr.local:7878
  token: "${RADARR_APIKEY}"
```

### lidarr
```yaml
adapter: lidarr
adapter_config:
  url: http://lidarr.local:8686
  token: "${LIDARR_APIKEY}"
```

### readarr
```yaml
adapter: readarr
adapter_config:
  url: http://readarr.local:8787
  token: "${READARR_APIKEY}"
```

### prowlarr
```yaml
adapter: prowlarr
adapter_config:
  url: http://prowlarr.local:9696
  token: "${PROWLARR_APIKEY}"
```

### bazarr
```yaml
adapter: bazarr
adapter_config:
  url: http://bazarr.local:6767
  token: "${BAZARR_APIKEY}"
```

### overseerr / jellyseerr
Both use the same adapter type `overseerr`:
```yaml
adapter: overseerr   # or jellyseerr
adapter_config:
  url: http://overseerr.local:5055
  token: "${OVERSEERR_TOKEN}"
```

---

## Download Clients

### qbittorrent
```yaml
adapter: qbittorrent
adapter_config:
  url: http://qbittorrent.local:8080
  username: "${QB_USER}"
  password: "${QB_PASS}"
```

### transmission
```yaml
adapter: transmission
adapter_config:
  url: http://transmission.local:9091
  username: "${TRANSMISSION_USER}"
  password: "${TRANSMISSION_PASS}"
```

### deluge
```yaml
adapter: deluge
adapter_config:
  url: http://deluge.local:8112
  password: "${DELUGE_PASS}"
```

### sabnzbd
```yaml
adapter: sabnzbd
adapter_config:
  url: http://sabnzbd.local:8080
  token: "${SABNZBD_APIKEY}"
```

### nzbget
```yaml
adapter: nzbget
adapter_config:
  url: http://nzbget.local:6789
  username: "${NZBGET_USER}"
  password: "${NZBGET_PASS}"
```

---

## Services & Tools

### nextcloud
```yaml
adapter: nextcloud
adapter_config:
  url: http://nextcloud.local
  username: "${NC_USER}"
  password: "${NC_PASS}"
```

### immich
```yaml
adapter: immich
adapter_config:
  url: http://immich.local:2283
  token: "${IMMICH_TOKEN}"
```

### vaultwarden
```yaml
adapter: vaultwarden
adapter_config:
  url: http://vaultwarden.local
  token: "${VW_TOKEN}"
```

### homeassistant
```yaml
adapter: homeassistant
adapter_config:
  url: http://homeassistant.local:8123
  token: "${HASS_TOKEN}"
```

### gitea / forgejo
Both use the same adapter:
```yaml
adapter: gitea   # or forgejo
adapter_config:
  url: http://gitea.local:3000
  token: "${GITEA_TOKEN}"
```

### gitlab
```yaml
adapter: gitlab
adapter_config:
  url: https://gitlab.local
  token: "${GITLAB_TOKEN}"
```

### paperless
```yaml
adapter: paperless
adapter_config:
  url: http://paperless.local:8000
  token: "${PAPERLESS_TOKEN}"
```

### firefly
```yaml
adapter: firefly
adapter_config:
  url: http://firefly.local
  token: "${FIREFLY_TOKEN}"
```

### speedtest
```yaml
adapter: speedtest
adapter_config:
  url: http://speedtest.local
```

---

## Networking

### cloudflare
Cloudflare Tunnel stats:
```yaml
adapter: cloudflare
adapter_config:
  token: "${CF_TOKEN}"
  account_id: "${CF_ACCOUNT_ID}"
```

### tailscale
```yaml
adapter: tailscale
adapter_config:
  token: "${TS_APIKEY}"
  tailnet: "${TS_TAILNET}"
```
