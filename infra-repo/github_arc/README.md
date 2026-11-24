helm install arc-controller \
  --namespace arc-system \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller

helm install arc-runner \
  --namespace arc-runner \
  -f runner-values.yaml \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set

# Already installed? apply changes with:
helm upgrade arc-runner --namespace arc-runner -f runner-values.yaml \
oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
