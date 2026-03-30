# CI/CD Workflow Reference

## Pipeline Overview

```
pipeline.yml
├── stage-ci.yml          (always)
├── stage-build-push.yml  (main branch only)
└── stage-deploy-ecs.yml  (main branch only)
```

Triggered on: `pull_request`, `push` (any branch), `workflow_dispatch`.
Build + deploy only runs when code lands on `main`.

---

## Feature Flags (Actions Variables)

Set these in **GitHub → Settings → Secrets and variables → Actions → Variables**.

### Opt-out flags (enabled by default, set to `'false'` to disable)

| Variable | Job | Notes |
|---|---|---|
| `ENABLE_TRIVY_SCAN` | Trivy fs scan (inside `run-tests`) | Filesystem vulnerability scan |
| `ENABLE_BUILD_VALIDATION` | `npm run build` (inside `run-tests`) | Skipping saves ~3–5 min per run |
| `ENABLE_OWASP_SCAN` | `owasp-dependency-check` | NVD database download is slow (~5–10 min) |
| `ENABLE_SEMGREP_SCAN` | `sast-semgrep` | SAST; requires `SEMGREP_APP_TOKEN` secret for Cloud dashboard |
| `ENABLE_SONAR_SCAN` | `sonar-scan` (11-job matrix) | Biggest minute consumer — disable on draft/feature branches |

### Opt-in flags (disabled by default, set to `'true'` to enable)

| Variable | Job | Notes |
|---|---|---|
| `ENABLE_LANGSMITH_EVALUATOR` | `langsmith-eval` (5-job matrix) | Requires `LANGSMITH_API_KEY` + `OPENAI_API_KEY` secrets |
| `ENABLE_DAST_SCAN` | `dast-zap` | Also requires `DAST_TARGET_URL` to be set |

### Other variables

| Variable | Used by | Example |
|---|---|---|
| `DAST_TARGET_URL` | `dast-zap` | `https://staging.onedelivery.com` |
| `AWS_REGION` | build, deploy | `ap-southeast-1` |
| `ECS_CLUSTER` | deploy | `onedelivery-cluster` |
| `ECS_TASK_EXECUTION_ROLE_ARN` | deploy | auto-derived from AWS account if unset |
| `ECS_TASK_ROLE_ARN` | deploy | auto-derived from AWS account if unset |
| `ECS_TASK_CPU` | deploy | `256` |
| `ECS_TASK_MEMORY` | deploy | `512` |
| `CORS_ORIGIN` | deploy | `https://app.onedelivery.com` |

---

## Required Secrets

| Secret | Used by |
|---|---|
| `SONAR_TOKEN` | `sonar-scan` |
| `NVD_API_KEY` | `owasp-dependency-check` |
| `SEMGREP_APP_TOKEN` | `sast-semgrep` (optional — works without it, no Cloud dashboard) |
| `LANGSMITH_API_KEY` | `langsmith-eval` |
| `OPENAI_API_KEY` | `langsmith-eval` |
| `AWS_ROLE_ARN` | `stage-build-push`, `stage-deploy-ecs` |
| `DATABASE_URL` | `stage-deploy-ecs` |
| `JWT_SECRET` | `stage-deploy-ecs` |
| `RABBITMQ_URL` | `stage-deploy-ecs` |

---

## Reducing GitHub Actions Minutes

### Biggest savings

| Action | Estimated saving |
|---|---|
| Set `ENABLE_SONAR_SCAN=false` on feature branches | ~11 jobs × 5 min = **~55 min/run** |
| Set `ENABLE_OWASP_SCAN=false` on feature branches | ~**8–10 min/run** |
| Set `ENABLE_BUILD_VALIDATION=false` on draft PRs | ~**3–5 min/run** |
| Only enable `ENABLE_DAST_SCAN` on `main` push | saves full ZAP scan on every PR |
| Only enable `ENABLE_LANGSMITH_EVALUATOR` on `main` push | ~5 jobs × 3 min = **~15 min/run** |

### Built-in optimisations already applied

- **Artifact `retention-days: 7`** — default is 90 days; reduces storage billing on all scan reports.
- **`fail-fast: false`** on all matrices — lets parallel jobs complete and avoids re-runs.
- **Docker layer cache (`--cache-from/to type=gha`)** in `stage-build-push` — speeds up repeated image builds.
- **DAST is opt-in** — ZAP runs a full active scan; gated behind both `ENABLE_DAST_SCAN=true` and `DAST_TARGET_URL`.

---

## Security Scan Summary

| Scan | Tool | Type | Report location |
|---|---|---|---|
| Filesystem vulnerabilities | Trivy | SCA | Console / workflow logs |
| Dependency CVEs | OWASP Dependency Check | SCA | Artifact: `owasp-dependency-check-report` |
| Static code analysis | Semgrep | SAST | GitHub Security tab + artifact: `semgrep-sarif` |
| Static code analysis | SonarQube (SonarCloud) | SAST | SonarCloud dashboard |
| Dynamic app scan | OWASP ZAP | DAST | Artifact: `zap-dast-report` |

---

## Service Ports Reference

| Service | Local | Container |
|---|---|---|
| audit | 3001 | 9001 |
| logistics | 3002 | 9002 |
| order | 3003 | 9003 |
| payment | 3004 | 9004 |
| user | 3005 | 9005 |
| incident | 3006 | 9006 |
| knowledge | 3007 | 9007 |
| orchestrator-agent | 3010 | 9010 |
| logistics-agent | 3011 | 9011 |
| resolution-agent | 3012 | 9012 |
| guardian-agent | 3013 | 9013 |
| qa-agent | 3014 | 9014 |
| ws-gateway | 3015 | 3015 |

Kong API Gateway proxies all services at port **8000** locally (`/socket.io` → ws-gateway).
