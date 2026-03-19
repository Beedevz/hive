# Release Process

Releases are fully automated via GitHub Actions. Creating a git tag triggers the entire pipeline.

## Steps

### 1. Ensure main is up to date

```bash
git checkout main
git pull
```

### 2. Create and push a tag

```bash
git tag v1.7.0
git push origin v1.7.0
```

### 3. GitHub Actions runs automatically

1. **`release.yml`** triggers on the new tag:
   - Builds multi-stage Docker image with `VERSION=v1.7.0`
   - Pushes to Docker Hub: `beedevztech/hive:v1.7.0` and `beedevztech/hive:latest`
   - Runs [git-cliff](https://git-cliff.org/) to generate changelog from commit history
   - Creates a GitHub Release with the changelog

2. **`helm-release.yml`** runs if `helm/Chart.yaml` changed:
   - Publishes updated Helm chart to GitHub Pages

---

## Versioning

Hive uses [Semantic Versioning](https://semver.org/):

| Bump | When | Example |
|---|---|---|
| Patch `v1.0.X` | Bug fixes, minor improvements | `fix: correct Pi-hole version path` |
| Minor `v1.X.0` | New adapters, new features | `feat(adapter): add Frigate support` |
| Major `vX.0.0` | Breaking config format changes | (rare) |

---

## Conventional Commits → Changelog

git-cliff reads commit messages and groups them into changelog sections:

```
feat(adapter): add Cloudflare tunnel stats  → 🔌 New Adapters
feat: add drag-and-drop reordering          → 🚀 New Features
fix: correct Pi-hole v6 API path            → 🐛 Bug Fixes
perf: cache adapter results for 60s         → ⚡ Performance
refactor: split multi-method handlers       → ♻️ Refactor
docs: update Helm chart README              → 📖 Documentation
chore(deps): bump Go to 1.25               → 📦 Dependencies
chore: update CI workflow                   → (hidden)
```

---

## Docker Hub

Images are published to: [beedevztech/hive](https://hub.docker.com/r/beedevztech/hive)

| Tag | Description |
|---|---|
| `latest` | Most recent release |
| `v1.7.0` | Specific version (pinned) |

**Always pin to a specific version in production** to avoid unexpected updates.

---

## If a Release Fails

If CI fails and the Docker image was never pushed (e.g. Trivy security scan blocks the build):

1. Fix the issue (e.g. upgrade Go version in Dockerfile)
2. Delete the failed tag:
   ```bash
   git tag -d v1.7.0
   git push origin --delete v1.7.0
   ```
3. Re-tag after fixing:
   ```bash
   git tag v1.7.0
   git push origin v1.7.0
   ```

If the image was partially pushed but the tag is stale in Helm:
```bash
helm upgrade hive hive/hive --set image.tag=v1.7.0
```
