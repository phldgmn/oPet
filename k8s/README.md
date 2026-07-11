# Kubernetes deployment (Kustomize + Flux)

Layout:

```
k8s/
├── base/                  # shared Deployments/Services/Ingress, no DB opinion
├── overlays/
│   ├── sqlite/            # file-based SQLite, single replica, PVC-backed
│   └── postgres/          # in-cluster Postgres StatefulSet + backend wiring
└── flux/                  # example Flux GitRepository / Kustomization / image-automation CRs
```

Pick **one** overlay per cluster/namespace — they both target the `opet`
namespace and are not meant to run side by side.

## 1. Choose SQLite or Postgres

| | `overlays/sqlite` | `overlays/postgres` |
|---|---|---|
| Storage | 1 RWO PVC holding `opet.db` | Postgres 16 StatefulSet + its own PVC |
| Replicas | `backend` pinned to 1 (file DB) | `backend` can scale (see caveat below) |
| Use when | small/single-node clusters, homelabs | you want a real RDBMS / HA-ready storage |

Both overlays reuse the same `backend`/`frontend` Deployments from `base`;
only `DATABASE_URL` and the volumes attached to `backend` differ.

## 2. Secrets

Kustomize secret manifests are **not** committed — copy the templates and
fill in real values, or manage them out-of-band (SOPS, SealedSecrets,
External Secrets) and commit the encrypted/sealed form under the same
filename:

```bash
cp k8s/overlays/sqlite/secret.example.yaml k8s/overlays/sqlite/secret.yaml
# or, for postgres:
cp k8s/overlays/postgres/secret.example.yaml k8s/overlays/postgres/secret.yaml
cp k8s/overlays/postgres/postgres-secret.example.yaml k8s/overlays/postgres/postgres-secret.yaml
```

`*.yaml` (unfilled) is git-ignored (see root `.gitignore`); `*.example.yaml`
is the checked-in template. `kustomize build`/`kubectl apply -k` fails
loudly if the real secret is missing — that's intentional.

For the postgres overlay, `backend-secret`'s `DATABASE_URL` must match
`postgres-secret`'s `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`.

## 3. Host / ingress class

`base/ingress.yaml` uses `${OPET_HOST}` and `${OPET_INGRESS_CLASS:=nginx}`
placeholders instead of a hardcoded host:

- **With Flux**: `spec.postBuild.substitute` in `k8s/flux/kustomization-*.yaml`
  supplies these — edit the values there.
- **With plain `kubectl apply -k`**: run `kustomize build overlays/<mode> |
  envsubst | kubectl apply -f -` (with `OPET_HOST`/`OPET_INGRESS_CLASS`
  exported), or just edit `base/ingress.yaml` directly.

The frontend calls the API with relative paths (no `VITE_API_URL` baked into
the image), so `/api` and `/uploads` **must** be routed to the `backend`
Service on the same host — the bundled Ingress already does this.

## 4. Try it locally

```bash
cp k8s/overlays/sqlite/secret.example.yaml k8s/overlays/sqlite/secret.yaml
# edit the values, then:
kustomize build k8s/overlays/sqlite | kubectl apply -f -
```

Or without a separate `kustomize` binary: `kubectl apply -k k8s/overlays/sqlite`.

## 5. Flux (GitOps / CI-CD)

`k8s/flux/` has ready-to-adapt CRs:

- `gitrepository.yaml` — Flux `Source`, points at this repo/branch.
- `kustomization-sqlite.yaml` / `kustomization-postgres.yaml` — Flux
  `Kustomization` reconciling one overlay into the `opet` namespace, with
  `postBuild.substitute` for `OPET_HOST`/`OPET_INGRESS_CLASS`. Apply **one**
  of the two.
- `image-automation.yaml` — optional `ImageRepository`/`ImagePolicy`/
  `ImageUpdateAutomation` for automatic image bumps. `.github/workflows/ghcr-image.yml`
  publishes `ghcr.io/pdiegmann/opet/{backend,frontend}` tagged `latest`,
  `<year>`, `<year>-<month>`, `<year>-<month>-<day>` (no semver), so the
  policy filters on the `YYYY-MM-DD` tag and orders numerically. The
  `backend`/`frontend` Deployments in `base` already carry the
  `{"$imagepolicy": "opet:<name>"}` marker comments these controllers need.
  Requires `image-reflector-controller` + `image-automation-controller` to be
  part of your Flux install (not included in a minimal `flux bootstrap`).

```bash
flux create source git opet --url=https://github.com/pdiegmann/oPet.git --branch=main --interval=5m -n flux-system
kubectl apply -f k8s/flux/kustomization-sqlite.yaml   # or kustomization-postgres.yaml
# optional:
kubectl apply -f k8s/flux/image-automation.yaml
```

Adjust `spec.url` in `gitrepository.yaml`/the `flux create source git`
command if you're deploying from a fork.

## 6. Notes / caveats

- **Migrations run on every pod start.** The container entrypoint runs
  `bun run scripts/prepare-db.ts` (Prisma generate + `migrate deploy`/`db push`
  + idempotent admin-user seed) before starting the server. Safe for the
  default single-replica backend; if you scale `backend` in postgres mode,
  Prisma's advisory locks make concurrent `migrate deploy` runs safe, but the
  seed and `db push` (used when no migrations exist yet) are not
  lock-protected — prefer real migrations under `backend/prisma/migrations`
  once you scale beyond 1 replica.
- **`NEWS_IMPORT_INTERVAL_MINUTES`** drives an in-process timer per pod; keep
  it `0` (default) or `backend` at `replicas: 1` to avoid duplicate imports.
- **Images run as non-root** (`bun` in the backend image, `nginx` uid 101 in
  the frontend image on port 8080) to satisfy the Kubernetes `restricted`
  Pod Security Standard; `backend`'s pod sets `fsGroup: 1000` so the mounted
  PVCs are group-writable.
- **Storage classes**: PVCs omit `storageClassName` to use the cluster
  default. Set it explicitly (commented placeholder in each PVC manifest) if
  your cluster has no default or you want a specific class (e.g. `longhorn`,
  `local-path`).
- **Uploads volume** (`backend-uploads` PVC, `/app/uploads`) is shared by
  both overlays and independent of the DB choice — petition images always
  need it.
