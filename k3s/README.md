# Firecracker pods on k3s (Kata `kata-fc`) in WSL2

## 1. WSL2 + KVM

`C:\Users\<you>\.wslconfig`:
```ini
[wsl2]
memory=4GB                  # RAM cap for WSL
processors=4
swap=4GB
nestedVirtualization=true   # exposes /dev/kvm inside WSL
```
```bash
wsl --shutdown              # (PowerShell) apply .wslconfig
ls -l /dev/kvm              # must exist
sudo apt install -y jq      # used to look up the Kata version
```

## 2. k3s

```bash
curl -sfL https://get.k3s.io | sh -                               # install k3s
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml                       # point kubectl/helm at k3s
echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> ~/.bashrc   # make it permanent
kubectl get pods -A                                               # all Running/Completed
```

## 3. Devmapper thin pool

Firecracker only accepts block devices → containers need devmapper instead of overlayfs.

```bash
SRC=/mnt/c/Users/Vartotojas/Desktop/Playground-beta/firecracker/k3s

install -m 755 $SRC/devmapper-pool.sh /usr/local/bin/              # creates/re-attaches the pool
install -m 644 $SRC/devmapper-pool.service /etc/systemd/system/    # runs it before k3s on boot
systemctl daemon-reload
systemctl enable --now devmapper-pool.service

mkdir -p /var/lib/rancher/k3s/agent/etc/containerd/config-v3.toml.d
cp $SRC/devmapper.toml /var/lib/rancher/k3s/agent/etc/containerd/config-v3.toml.d/   # enable snapshotter
systemctl restart k3s

k3s ctr plugins ls | grep devmapper     # must say "ok"
dmsetup status devpool                  # pool usage
```

## 4. Kata (kata-fc)

```bash
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash   # install helm

export VERSION=$(curl -sSL https://api.github.com/repos/kata-containers/kata-containers/releases/latest | jq -r .tag_name)
export CHART="oci://ghcr.io/kata-containers/kata-deploy-charts/kata-deploy"

# installs Kata + Firecracker, adds kata-fc runtime to containerd, restarts k3s
helm install kata-deploy "$CHART" --version "$VERSION" -n kube-system \
    -f kata-fc-values.yaml --timeout 20m    # big image → long timeout

kubectl get runtimeclass | grep kata        # kata-fc
```

## 5. Test

```bash
kubectl apply -f kata-fc-test-pod.yaml      # pod with runtimeClassName: kata-fc
kubectl get pod fc-test -w                  # wait for Running

kubectl exec fc-test -- uname -r            # guest kernel (not *-microsoft-standard-WSL2)
kubectl exec fc-test -- free -m             # ~479 MB = 256 base + 256Mi limit
ps -ef | grep '[f]irecracker'               # one Firecracker process per pod
dmsetup ls                                  # devpool-snap-N = pod disks

kubectl delete pod fc-test
```

## Uninstall

```bash
helm uninstall kata-deploy -n kube-system   # removes Kata, restores containerd config
```

## Errors

| Error | Fix |
|---|---|
| `ctr: ... no unpack platforms defined` | Add `--local` to `k3s ctr images pull` |
| `helm install` → `timed out waiting for the condition` | Image still downloading → `--timeout 20m` |
| `cannot re-use a name that is still in use` | `helm uninstall kata-deploy -n kube-system` |
| Kata missing after reinstall, old jobs `Completed` | `kubectl -n kube-system delete job kata-deploy-install-dispatcher kata-deploy-install-<node>`, reinstall |
| `Failed to watch ... unable to handle the request` | k3s restarting during install → ignore |
| Firecracker runs as `Uid: 0` | Kata default (still chroot + seccomp) |

## Notes

- Thin pool disappears on WSL restart → `devmapper-pool.service` recreates it.
- WSL stops when all terminals close → pods die.
- 4 GB WSL ≈ 4–5 kata-fc pods at 256Mi.
