#!/usr/bin/env bash
# One-terminal Firecracker launcher, running Firecracker inside the jailer.
# Run from the folder that holds vmlinux-*, *.ext4 and *.id_rsa (e.g. ~/fc):
#
#   bash run_vm.sh            # persistent disk, network locked down
#   bash run_vm.sh --fresh    # throwaway: clean disk copy, destroyed when you leave SSH
#   bash run_vm.sh --open     # disable network lockdown (guest can reach LAN/host)
#
# Flags can be combined: bash run_vm.sh --fresh --open
set -euo pipefail
cd "$(dirname "$0")"

FRESH=0
LOCKDOWN=1
for arg in "$@"; do
    case "$arg" in
        --fresh) FRESH=1 ;;
        --open)  LOCKDOWN=0 ;;
        -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
        *) echo "Unknown option: $arg (try --help)"; exit 1 ;;
    esac
done

TAP_DEV="tap0"
TAP_IP="172.16.0.1"
GUEST_IP="172.16.0.2"
FC_MAC="06:00:AC:10:00:02"   # must match TAP_IP/GUEST_IP (fcnet-setup.sh in the rootfs)
VCPUS=2
MEM_MIB=1024

# --- Jailer settings -------------------------------------------------------
VM_ID="vm1"                       # unique per VM
JAIL_UID=10000                    # unprivileged user Firecracker drops to
JAIL_GID=10000
CHROOT_BASE="/srv/jailer"
FC_BIN="$(command -v firecracker)"
JAILER_BIN="$(command -v jailer)"
# jailer layout: <chroot-base>/<exec-file-name>/<id>/root
JAIL_DIR="$CHROOT_BASE/$(basename "$FC_BIN")/$VM_ID"
JAIL_ROOT="$JAIL_DIR/root"

KERNEL="$PWD/$(ls vmlinux* | tail -1)"
ROOTFS="$PWD/$(ls *.ext4 | tail -1)"
KEY="$PWD/$(ls *.id_rsa | tail -1)"
CONSOLE_LOG="$PWD/console.log"

if pgrep -x firecracker >/dev/null; then
    echo "A firecracker VM is already running. Stop it first (reboot inside it, or: sudo pkill -KILL -x firecracker)."
    exit 1
fi

sudo -v   # ask for the sudo password up front

# --- Host networking -------------------------------------------------------
# The tap is owned by the jail user, so unprivileged Firecracker can open it.
sudo ip link del "$TAP_DEV" 2>/dev/null || true
sudo ip tuntap add dev "$TAP_DEV" mode tap user "$JAIL_UID" group "$JAIL_GID"
sudo ip addr add "${TAP_IP}/30" dev "$TAP_DEV"
# No IPv6 on the tap: otherwise the guest could reach host services via link-local fe80::
sudo sysctl -qw "net.ipv6.conf.${TAP_DEV}.disable_ipv6=1"
sudo ip link set dev "$TAP_DEV" up

sudo sh -c "echo 1 > /proc/sys/net/ipv4/ip_forward"
sudo iptables -P FORWARD ACCEPT
HOST_IFACE=$(ip -j route list default | jq -r '.[0].dev')
sudo iptables -t nat -D POSTROUTING -o "$HOST_IFACE" -j MASQUERADE 2>/dev/null || true
sudo iptables -t nat -A POSTROUTING -o "$HOST_IFACE" -j MASQUERADE

# --- Network lockdown ------------------------------------------------------
# Own chains, flushed and rebuilt each run, so re-running never stacks rules.
#   FC_OUT : guest -> anywhere (forwarded)   internet yes, private ranges no
#   FC_IN  : anywhere -> guest (forwarded)   only replies to guest's own connections
#   FC_HOST: guest -> this host itself       only replies (your SSH session), nothing new
setup_chain() {  # <chain> <parent> <match...>
    local chain=$1 parent=$2; shift 2
    sudo iptables -N "$chain" 2>/dev/null || true
    sudo iptables -F "$chain"
    sudo iptables -C "$parent" "$@" -j "$chain" 2>/dev/null \
        || sudo iptables -I "$parent" 1 "$@" -j "$chain"
}
remove_chain() {  # <chain> <parent> <match...>
    local chain=$1 parent=$2; shift 2
    sudo iptables -D "$parent" "$@" -j "$chain" 2>/dev/null || true
    sudo iptables -F "$chain" 2>/dev/null || true
    sudo iptables -X "$chain" 2>/dev/null || true
}

if [ "$LOCKDOWN" = 1 ]; then
    setup_chain FC_OUT  FORWARD -i "$TAP_DEV"
    setup_chain FC_IN   FORWARD -o "$TAP_DEV"
    setup_chain FC_HOST INPUT   -i "$TAP_DEV"

    sudo iptables -A FC_OUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 \
               100.64.0.0/10 127.0.0.0/8 224.0.0.0/4 240.0.0.0/4; do
        sudo iptables -A FC_OUT -d "$net" -j DROP
    done
    sudo iptables -A FC_OUT -j ACCEPT

    sudo iptables -A FC_IN -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    sudo iptables -A FC_IN -j DROP

    sudo iptables -A FC_HOST -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    sudo iptables -A FC_HOST -j DROP
    NET_MODE="locked down (internet only; LAN + host blocked)"
else
    remove_chain FC_OUT  FORWARD -i "$TAP_DEV"
    remove_chain FC_IN   FORWARD -o "$TAP_DEV"
    remove_chain FC_HOST INPUT   -i "$TAP_DEV"
    NET_MODE="OPEN (guest can reach LAN and host)"
fi

# --- Prepare the chroot ----------------------------------------------------
# Firecracker will only see files inside $JAIL_ROOT.
sudo rm -rf "$JAIL_DIR"
sudo mkdir -p "$JAIL_ROOT"
sudo ln -f "$KERNEL" "$JAIL_ROOT/vmlinux" 2>/dev/null || sudo cp "$KERNEL" "$JAIL_ROOT/vmlinux"

if [ "$FRESH" = 1 ]; then
    # Throwaway disk: sparse copy of the pristine image; the original is never touched.
    sudo cp --sparse=always "$ROOTFS" "$JAIL_ROOT/rootfs.ext4"
    DISK_MODE="fresh (throwaway copy, deleted when you leave SSH)"
else
    # Persistent disk: hard link = same file, so changes are saved to $ROOTFS.
    # (With a hard link, chown below also changes the owner of $ROOTFS itself.)
    sudo ln -f "$ROOTFS" "$JAIL_ROOT/rootfs.ext4" 2>/dev/null || {
        echo "Could not hard-link the rootfs (different filesystem?). Use --fresh, or move ~/fc onto the same filesystem as $CHROOT_BASE."
        exit 1
    }
    DISK_MODE="persistent (changes saved to $(basename "$ROOTFS"))"
fi
sudo chown "$JAIL_UID:$JAIL_GID" "$JAIL_ROOT/rootfs.ext4"

# Paths below are relative to the chroot, not the host.
sudo tee "$JAIL_ROOT/vm.json" >/dev/null <<EOF
{
  "boot-source": {
    "kernel_image_path": "/vmlinux",
    "boot_args": "console=ttyS0 reboot=k panic=1"
  },
  "drives": [
    {
      "drive_id": "rootfs",
      "path_on_host": "/rootfs.ext4",
      "is_root_device": true,
      "is_read_only": false
    }
  ],
  "network-interfaces": [
    {
      "iface_id": "net1",
      "guest_mac": "$FC_MAC",
      "host_dev_name": "$TAP_DEV"
    }
  ],
  "machine-config": {
    "vcpu_count": $VCPUS,
    "mem_size_mib": $MEM_MIB
  }
}
EOF

# --- Fresh mode: destroy the VM and its disk when this script ends ---------
destroy_vm() {
    echo "Destroying throwaway VM..."
    # Firecracker is PID 1 of its own PID namespace (--new-pid-ns), so it ignores
    # SIGTERM from outside. SIGKILL is the only signal that reliably stops it.
    sudo pkill -KILL -x -u "$JAIL_UID" firecracker 2>/dev/null || true
    for _ in $(seq 1 50); do pgrep -x firecracker >/dev/null || break; sleep 0.1; done
    if pgrep -x firecracker >/dev/null; then
        echo "WARNING: firecracker is still running; disk NOT deleted. Stop it with: sudo pkill -KILL -x firecracker"
        return
    fi
    sudo rm -rf "$JAIL_DIR"
    echo "Done. VM stopped and its disk deleted; nothing from this session was kept."
}
if [ "$FRESH" = 1 ]; then trap destroy_vm EXIT; fi

# --- Boot via the jailer in the background ---------------------------------
# jailer: copies firecracker into the chroot, creates /dev/kvm + /dev/net/tun
# there, enters new mount (+ PID) namespaces, pivot_roots, drops to JAIL_UID,
# then execs firecracker, which installs its seccomp filters.
# Everything after "--" is passed to firecracker.
sudo "$JAILER_BIN" \
    --id "$VM_ID" \
    --exec-file "$FC_BIN" \
    --uid "$JAIL_UID" --gid "$JAIL_GID" \
    --chroot-base-dir "$CHROOT_BASE" \
    --cgroup-version 2 \
    --new-pid-ns \
    -- \
    --no-api --config-file /vm.json --enable-pci \
    > "$CONSOLE_LOG" 2>&1 < /dev/null &

echo "Booting jailed VM"
echo "  disk:    $DISK_MODE"
echo "  network: $NET_MODE"
echo "  console: tail -f $CONSOLE_LOG"

# --- Wait until SSH answers instead of a fixed sleep -----------------------
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null
          -o LogLevel=ERROR -o ConnectTimeout=1)
sleep 0.5
for _ in $(seq 1 60); do
    if ssh "${SSH_OPTS[@]}" root@"$GUEST_IP" true 2>/dev/null; then break; fi
    if ! pgrep -x firecracker >/dev/null; then
        echo "Firecracker exited during boot. Last console lines:"; tail -20 "$CONSOLE_LOG"; exit 1
    fi
    sleep 0.5
done

# --- Guest network setup (internet + DNS) ----------------------------------
ssh "${SSH_OPTS[@]}" root@"$GUEST_IP" "
    ip route add default via $TAP_IP dev eth0 2>/dev/null || true
    printf 'nameserver 8.8.8.8\noptions single-request-reopen\n' > /etc/resolv.conf
"

if [ "$FRESH" = 1 ]; then
    echo "VM is up. Leaving SSH ('exit' or 'reboot') DESTROYS this VM and its disk."
else
    echo "VM is up. 'exit' leaves SSH (VM keeps running); 'reboot' inside the VM stops it."
fi
ssh "${SSH_OPTS[@]}" root@"$GUEST_IP" || true
