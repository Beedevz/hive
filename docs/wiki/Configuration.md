# Configuration

Hive is configured via a single YAML (or JSON) file at `/config/config.yaml`.

## Full Reference

```yaml
settings:
  title: "Hive"              # Browser tab title
  theme: dark                # dark | light | auto
  language: en               # UI language (en only at this time)
  show_greeting: true        # Show greeting text above services
  greeting: "Good morning"   # Custom greeting string
  columns: 2                 # Service grid columns: 1 | 2 | 3 | 4

widgets:
  - type: clock
    enabled: true

  - type: search
    enabled: true
    config:
      engine: google         # google | duckduckgo | bing | startpage | custom
      custom_url: ""         # Required when engine: custom

  - type: resources
    enabled: false           # CPU, RAM, disk from /api/system

  - type: weather
    enabled: false
    config:
      lat: 41.01
      lon: 28.98
      location_name: Istanbul

services:
  - category: Infrastructure
    icon: "🖥️"              # Category icon (emoji, URL, or lucide:IconName)
    items:
      - name: Portainer
        url: http://portainer.local:9000
        icon: https://cdn.jsdelivr.net/gh/selfhst/icons/svg/portainer.svg
        description: Container management
        tag: CE                        # Optional badge shown on card
        adapter: portainer             # Adapter type (see Adapters)
        adapter_config:
          url: http://portainer.local:9000
          token: "${PORTAINER_TOKEN}"  # Env var expansion

bookmarks:
  - category: Dev Tools
    items:
      - name: GitHub
        url: https://github.com
        icon: https://cdn.jsdelivr.net/gh/selfhst/icons/svg/github.svg
```

---

## Icons

Icons can be specified as:

| Format | Example |
|---|---|
| Emoji | `"🖥️"` |
| Remote URL | `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/portainer.svg` |
| Lucide icon name | `lucide:Server` |

The [selfh.st icon library](https://selfh.st/icons/) has SVG icons for most homelab services.

---

## Environment Variable Expansion

Any value in `adapter_config` can reference environment variables:

```yaml
adapter_config:
  token: "${MY_SECRET_TOKEN}"
  url: "${SERVICE_URL}"
```

Variables are expanded server-side at request time. They are **never** sent to the browser.

You can define variables in:
- `.env` file (Docker Compose)
- Kubernetes secret (Helm chart)
- Secrets API (`/api/secrets`) — see [[Secrets Management]]

---

## Format

Hive supports both YAML and JSON. The file is auto-detected:

1. Looks for `config.yaml` first
2. Falls back to `config.json`

You can export the current config as JSON from the UI (unlock → export button) and import it back.

---

## Backups

Every time the config is saved via the UI or API, a timestamped backup is created automatically:

```
/config/config.backup.1710000000.yaml
```

You can download the current config via `GET /api/config/backup` (requires auth token).
