#!/usr/bin/env bash
# Deploy the aiprov chaincode on the Hyperledger Fabric test-network and benchmark it with Caliper.
# Requirements: Linux/macOS or WSL2, Docker + Docker Compose, Node.js 18+, git, curl, jq.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

# 1) Fabric binaries, docker images and samples (latest 2.5 LTS defaults of the installer)
if [ ! -d fabric-samples ]; then
  curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
  chmod +x install-fabric.sh
  ./install-fabric.sh docker samples binary
fi

# 2) Chaincode unit tests (fail fast before touching the network)
(cd chaincode && npm install --no-audit --no-fund && npm test)

# 3) Network: 2 organisations, Raft orderer, CAs, one channel
cd fabric-samples/test-network
./network.sh down || true
./network.sh up createChannel -c mychannel -ca

# 4) Deploy chaincode. Both organisations must endorse every write.
./network.sh deployCC -c mychannel -ccn aiprov -ccp "$HERE/chaincode" -ccl javascript \
  -ccep "AND('Org1MSP.peer','Org2MSP.peer')"

# 5) Caliper
cd "$HERE/caliper"
npm install --no-audit --no-fund
npx caliper bind --caliper-bind-sut fabric:2.4
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/test-network.yaml \
  --caliper-benchconfig benchmarks/config.yaml \
  --caliper-flow-only-test

python3 parse_caliper_report.py report.html "$HERE/../results/caliper_summary.csv"
echo "Done. Share: caliper/report.html and results/caliper_summary.csv"
# Tear down when finished:  (cd fabric-samples/test-network && ./network.sh down)
