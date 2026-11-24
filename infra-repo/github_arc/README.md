# GitHub Actions Runner Controller (ARC)

Self-hosted GitHub Actions runners on k3s. Each job gets a fresh runner pod inside a Firecracker microVM (`runtimeClassName: kata-fc`).

## Files

| File | Purpose |
|---|---|
| `namespace.yaml` | `arc-system` (controller) and `arc-runner` (runners) |
| `secret.yaml` | GitHub PAT (`github-pat`) — never commit the real token |
| `runner-values.yaml` | Runner set config: repo URL, `kata-fc`, 2Gi/2 CPU, `maxRunners: 1` |

## Install

```bash
# 1. Namespaces + PAT secret
kubectl apply -f namespace.yaml
kubectl apply -f secret.yaml

# 2. Controller (one per cluster)
helm install arc-controller \
  --namespace arc-system \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller

# 3. Runner set (release name = runs-on label)
helm install arc-runner \
  --namespace arc-runner \
  -f runner-values.yaml \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
```

## Verify

```bash
kubectl get pods -n arc-system         # controller + listener Running
kubectl get pods -n arc-runner -w      # a runner pod appears per job
```

Use it in a workflow:

```yaml
runs-on: arc-runner
```

## Update

```bash
helm upgrade arc-runner \
  --namespace arc-runner \
  -f runner-values.yaml \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
```

## Uninstall

Order matters — remove the runner set **before** the controller, or `arc-runner` gets stuck in `Terminating`.

```bash
helm uninstall arc-runner --namespace arc-runner
helm uninstall arc-controller --namespace arc-system
kubectl delete ns arc-runner arc-system
```
