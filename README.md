# firecracker-arc

Self-hosted GitHub Actions where each job runs in its own Firecracker microVM, builds the app images, and pushes them to GHCR.

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant GH as GitHub Actions
    participant L as ARC Listener
    participant C as ARC Controller
    participant K as Kata (kata-fc)
    participant VM as Firecracker microVM<br/>(runner)
    participant R as GHCR

    Dev->>GH: git push (app-repo/**)
    GH->>GH: queue job (runs-on: arc-runner)
    L->>GH: long-poll for jobs
    GH-->>L: 1 job queued
    L->>C: scale EphemeralRunnerSet to 1
    C->>GH: request JIT runner config
    GH-->>C: JIT config
    C->>K: create runner pod (runtimeClassName: kata-fc)
    K->>K: devmapper snapshot = VM disk
    K->>VM: boot microVM, start runner container
    VM->>GH: register with JIT config
    GH-->>VM: assign job
    VM->>VM: checkout, install Buildah
    VM->>R: buildah login (GITHUB_TOKEN)
    loop shop, inventory, payment
        VM->>VM: buildah build (vfs + chroot)
        VM->>R: push service:commit-sha
    end
    VM->>GH: report job result
    VM-->>C: runner exits (one job only)
    C->>K: delete pod + EphemeralRunner
    K->>VM: destroy VM + disk
```

## Stack

- **k3s** on WSL2 (`/dev/kvm`)
- **Kata Containers + Firecracker** → RuntimeClass `kata-fc`
- **ARC** (Actions Runner Controller) → one ephemeral runner pod per job
- **Buildah** → builds without a Docker daemon
- **GHCR** → images tagged with the short commit SHA (7 chars), pushed with `GITHUB_TOKEN` (`packages: write`)

## Setup

1. Kata + Firecracker: `infra-repo/kata-fc-devmapper/README.md`
2. Runners: `infra-repo/github_arc/README.md`
3. Push to `main` or run the `build-and-push` workflow.

## Layout

| Path | What |
|---|---|
| `.github/workflows/ci.yaml` | Build + push to GHCR |
| `app-repo/` | `shop`, `inventory`, `payment` services |
| `infra-repo/kata-fc-devmapper/` | Kata + Firecracker on k3s |
| `infra-repo/github_arc/` | ARC runner config |
| `infra-repo/micro-service/` | Kustomize manifests |
| `infra-repo/argocd/` | Argo CD |
| `local/` | Standalone Firecracker VM |
