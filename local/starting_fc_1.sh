API_SOCKET="/tmp/firecracker.socket"

# Remove API unix socket
sudo rm -f $API_SOCKET

# Run firecracker
sudo firecracker --api-sock "${API_SOCKET}" --enable-pci > console.log 2>&1 < /dev/null &

# wait for the socket
while [ ! -S "$API_SOCKET" ]; do sleep 0.05; done   
