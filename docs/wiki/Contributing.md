# Development

## Prerequisites

- Go 1.25+
- Node.js 20+
- Docker + Docker Compose

---

## Project Structure

```
hive/
├── frontend/          # React 19 + Vite SPA
│   ├── src/
│   │   ├── App.jsx        # Root component, adapter definitions
│   │   ├── components/    # UI components
│   │   └── hooks/         # useConfig, useAdapterStats, useWindowSize
│   └── public/        # Static assets (logos, favicon)
├── config-api/        # Go HTTP API
│   ├── main.go            # HTTP server + all route handlers
│   ├── adapter_handler.go # Adapter routing + caching
│   ├── adapters/          # 45+ service adapters
│   └── docs/              # Generated Swagger (do not edit)
├── nginx/             # nginx configs
├── helm/              # Kubernetes Helm chart
└── Dockerfile         # Multi-stage production build
```

---

## Running Locally

### Full stack (Docker)

```bash
cp .env.example .env
# edit .env
docker compose up --build
```

Open `http://localhost:3000`

### Frontend only (hot reload)

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173` and proxies `/api/` to `http://localhost:3001`.

### Backend only

```bash
cd config-api
go run .
```

Listens on port 3001. Set `CONFIG_DIR=./config` to point at a local config dir.

---

## Adding a New Adapter

1. **Create the adapter file**

   ```
   config-api/adapters/myadapter.go
   ```

   ```go
   package adapters

   func fetchMyAdapterStats(cfg map[string]interface{}, serviceURL string) AdapterResult {
       token, _ := cfg["token"].(string)
       // fetch from API...
       return AdapterResult{
           Adapter: "myadapter",
           Ok:      true,
           Stats: []StatItem{
               {Label: "Items", Value: "42", Status: "ok"},
           },
       }
   }
   ```

2. **Register in dispatcher** (`adapters/run.go`)

   ```go
   case "myadapter":
       return fetchMyAdapterStats(cfg, serviceURL)
   ```

3. **Add to frontend** (`frontend/src/App.jsx` — `ADAPTER_DEFS`)

   ```js
   myadapter: {
     label: "My Adapter",
     fields: [{ key: "token", label: "API Token", secret: true }],
   }
   ```

4. **Test**

   ```bash
   curl "http://localhost:3001/adapters/myadapter?service=myservice"
   ```

---

## Swagger Docs

Swagger docs are generated from Go annotations using [swaggo/swag](https://github.com/swaggo/swag).

After changing any handler annotations, regenerate:

```bash
cd config-api
swag init --generalInfo main.go --output docs
```

The generated files in `docs/` are committed to the repository. The Dockerfile runs `swag init` automatically during the build.

View interactive docs at `http://localhost:3000/api/swagger/`

---

## Conventional Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated changelog generation.

| Prefix | Release type | Changelog section |
|---|---|---|
| `feat(adapter):` | minor | 🔌 New Adapters |
| `feat:` | minor | 🚀 New Features |
| `fix:` | patch | 🐛 Bug Fixes |
| `perf:` | patch | ⚡ Performance |
| `refactor:` | patch | ♻️ Refactor |
| `docs:` | — | 📖 Documentation |
| `chore(deps):` | — | 📦 Dependencies |

---

## CI / CD

| Workflow | Trigger | Action |
|---|---|---|
| `ci.yml` | PR opened | Build + CodeQL scan |
| `release.yml` | Git tag pushed | Build image → Docker Hub + GitHub Release |
| `helm-release.yml` | Chart changes | Publish Helm chart to GitHub Pages |
| `codeql.yml` | Push to main | CodeQL security analysis |

See [[Release Process]] for the full release flow.
