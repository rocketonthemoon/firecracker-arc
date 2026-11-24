# Install helm arc controller 
helm install arc-controller \
  --namespace arc-system \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller

# Install helm arc runner
helm install arc-runner \
  --namespace arc-runner \
  -f runner-values.yaml \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set

# Uninstalling after testing
helm uninstall arc-controller --namespace arc-system
helm uninstall arc-runner --namespace arc-runner
kubectl delete ns arc-runner arc-system
