#!/usr/bin/env bash
# Create (first run) or re-attach (every boot) a device-mapper thin pool
# backed by two sparse files, for containerd's devmapper snapshotter.
# Safe to run repeatedly: does nothing if the pool already exists.
set -euo pipefail

POOL_NAME="devpool"
DIR="/var/lib/devmapper-pool"
DATA_SIZE="20G"        # max space for all container disks (sparse: real use grows as needed)
META_SIZE="1G"         # bookkeeping: which block belongs to which snapshot
DATA_BLOCK_SIZE=128    # pool allocation unit in 512-byte sectors (128 = 64 KiB)
LOW_WATER_MARK=32768   # free blocks left before the kernel raises a "pool nearly full" event

# 1. Thin-pool support is a kernel module in the WSL kernel.
modprobe dm_thin_pool

# 2. Already set up (e.g. script ran twice)? Then there is nothing to do.
if dmsetup status "$POOL_NAME" >/dev/null 2>&1; then
    echo "Thin pool '$POOL_NAME' already active."
    exit 0
fi

# 3. Backing files. truncate makes sparse files: they claim DATA_SIZE but
#    use ~0 bytes on disk until written. Existing files are kept (that is
#    where all your image/container data lives).
mkdir -p "$DIR"
[ -f "$DIR/data" ] || truncate -s "$DATA_SIZE" "$DIR/data"
[ -f "$DIR/meta" ] || truncate -s "$META_SIZE" "$DIR/meta"

# 4. Loop devices turn the files into block devices (/dev/loopN).
#    They vanish on every WSL restart, which is why this runs at boot.
DATA_DEV=$(losetup --find --show "$DIR/data")
META_DEV=$(losetup --find --show "$DIR/meta")

# 5. Create the thin pool. Table format:
#    <start> <length-in-sectors> thin-pool <meta dev> <data dev> <block size> <low water mark>
#    On re-attach, the kernel reads the existing metadata, so all snapshots come back.
SECTORS=$(( $(blockdev --getsize64 "$DATA_DEV") / 512 ))
dmsetup create "$POOL_NAME" --table \
    "0 $SECTORS thin-pool $META_DEV $DATA_DEV $DATA_BLOCK_SIZE $LOW_WATER_MARK"

echo "Thin pool '$POOL_NAME' active (data=$DATA_DEV meta=$META_DEV)."
