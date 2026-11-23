# Standalone Firecracker VM in WSL2

## Files

| File | Purpose |
|---|---|
| `get_rootfs_kernel.sh` | Download kernel + Ubuntu rootfs, add SSH key, build `.ext4` |
| `run_vm.sh` | Jailed VM in one terminal (lockdown, `--fresh`, `--open`) |
| `starting_fc_1.sh` / `starting_fc_2.sh` | Old two-terminal API version (getting-started guide) |

## 1. Setup

```bash
sudo apt install -y iptables jq squashfs-tools e2fsprogs   # host tools
ls -l /dev/kvm                                             # KVM must exist (nestedVirtualization=true)
# firecracker + jailer (same version) → /usr/local/bin
```

## 2. Kernel + rootfs

```bash
mkdir -p ~/fc && cd ~/fc                 # NOT /mnt/c (Linux permissions break there)
cp /mnt/c/Users/Vartotojas/Desktop/Playground-beta/firecracker/local/*.sh .
bash get_rootfs_kernel.sh                # → vmlinux-*, ubuntu-*.ext4, ubuntu-*.id_rsa
chmod 600 ubuntu-*.id_rsa                # ssh refuses keys with open permissions
```

## 3. Run

```bash
bash run_vm.sh            # persistent disk, network locked down
bash run_vm.sh --fresh    # throwaway disk, destroyed when you leave SSH
bash run_vm.sh --open     # guest can reach LAN/host
```

```bash
tail -f ~/fc/console.log                    # guest serial console
pgrep -x firecracker && echo running        # status
sudo pkill -KILL -x firecracker             # stop (or `reboot` inside VM)
```

Reconnect / copy files:
```bash
OPTS="-i ubuntu-24.04.id_rsa -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
ssh $OPTS root@172.16.0.2                   # back into a running VM
scp $OPTS ./file root@172.16.0.2:/root/     # copy in
scp $OPTS root@172.16.0.2:/root/out.txt ./  # copy out
```

## 4. Verify

```bash
# host: jailer active
PID=$(pgrep -x firecracker | head -1)
grep -E 'Uid|Seccomp' /proc/$PID/status     # Uid 10000, Seccomp 2
sudo ls /proc/$PID/root/                    # only jail files

# guest: lockdown active
ping -c 2 8.8.8.8                           # works
ping -c 2 -W 2 172.16.0.1                   # blocked (host)
curl -m 3 http://192.168.1.1 || echo blocked   # blocked (LAN)
```

## Errors

| Error | Fix |
|---|---|
| `iptables` / `jq: command not found` | `apt install -y iptables jq` |
| SSH asks for password / `Permission denied` | Rootfs built under `/mnt/c` → rebuild in `~/fc` |
| Boot log: `marked world-writable` | Same `/mnt/c` problem |
| `No route to host` on first SSH | VM still booting; `run_vm.sh` retries |
| `apt update` → `Killed` | 128 MiB default RAM; `run_vm.sh` sets 1024 |
| `readlink /proc/$PID/root` → `/` | Jailer pivot_root; use `ls /proc/$PID/root/` |
| `--fresh` VM survives exit | PID-ns init ignores SIGTERM → `pkill -KILL` (fixed) |

## Notes

- One VM at a time (fixed `tap0` / `172.16.0.2`).
- Lockdown blocks LAN + host only; public internet still reachable.
- No secrets inside the VM.
