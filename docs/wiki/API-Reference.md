# API Reference

The Go backend listens on port 3001 and is proxied by nginx at `/api/`.

> **Interactive docs:** Swagger UI is available at `http://your-host/api/swagger/`

## Authentication

Protected endpoints require a token in one of these headers:

```
X-Hive-Token: your-token
Authorization: Bearer your-token
```

The token is set via the `HIVE_TOKEN` environment variable (default: `changeme`).

---

## System Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | — | Returns `{"status":"ok"}` |
| GET | `/api/version` | — | Returns running version |
| GET | `/api/system` | — | CPU %, RAM, disk usage |
| GET | `/api/auth/verify` | ✓ | Validates token |

### GET /api/system

```json
{
  "cpu": 12.5,
  "ram": { "used": 4096, "total": 16384, "percent": 25.0 },
  "disk": { "used": 50000, "total": 200000, "percent": 25.0 }
}
```

---

## Config Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/config` | — | Full config as JSON |
| PUT | `/api/config` | ✓ | Save config (auto-backup) |
| GET | `/api/config/backup` | ✓ | Download config file |
| GET | `/api/config/raw` | — | Raw YAML/JSON text |
| PUT | `/api/config/raw` | ✓ | Import raw YAML/JSON |

### GET /api/config/raw

Optional query param: `?format=yaml` or `?format=json`

---

## Probe Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/probe/{name}/status` | — | Online/offline + latency |
| GET | `/api/probe/{name}/details` | — | Adapter stats for service |

`{name}` must match a service `name` in config.yaml.

### GET /api/probe/{name}/status

```json
{
  "status": "online",
  "latency_ms": 12
}
```

Status values: `online` | `offline` | `unknown`

---

## Adapter Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/adapters/{type}` | — | Run adapter, 60s cache |
| GET | `/api/adapters-catalog` | — | All adapter types + metadata |

### GET /api/adapters/{type}?service={name}

- `type` — adapter type (e.g. `portainer`, `pihole`)
- `service` — service name as defined in config

```json
{
  "adapter": "portainer",
  "ok": true,
  "stats": [
    { "label": "Containers", "value": "12", "status": "ok" },
    { "label": "Running", "value": "10", "status": "ok" }
  ]
}
```

`status` values per stat item: `ok` | `warning` | `error` | `info`

---

## Logo Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/logo` | — | Get logo image |
| POST | `/api/logo` | ✓ | Upload logo (multipart/form-data) |
| DELETE | `/api/logo` | ✓ | Remove custom logo |

### GET /api/logo

Optional query param: `?theme=dark` or `?theme=light`

Returns the theme-appropriate logo as an image file.

---

## Secrets Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/secrets` | ✓ | List secret key names |
| PUT | `/api/secrets` | ✓ | Add or update a secret |
| DELETE | `/api/secrets` | ✓ | Delete a secret |
| GET | `/api/secrets/backup` | ✓ | Download secrets.yaml |
| POST | `/api/secrets/import` | ✓ | Import secrets from YAML |

See [[Secrets Management]] for usage details.

---

## Swagger UI

Swagger UI with interactive docs is served at:

```
http://your-host/api/swagger/
```

You can authorize with your `HIVE_TOKEN` in the Authorize dialog and execute API calls directly from the browser.
