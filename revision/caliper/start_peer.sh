#!/bin/bash
export NO_PROXY=localhost,127.0.0.1,.example.com,example.com no_proxy=localhost,127.0.0.1,.example.com,example.com; unset HTTPS_PROXY HTTP_PROXY https_proxy http_proxy GRPC_PROXY grpc_proxy ALL_PROXY all_proxy
# usage: start_peer.sh <orgnum> <port>
B=/home/claude/fab; N=$B/net; ORG=org$1; P=$2
D=$N/organizations/peerOrganizations/$ORG.example.com/peers/peer0.$ORG.example.com
export FABRIC_CFG_PATH=$N/peercfg
export CORE_PEER_ID=peer0.$ORG.example.com CORE_PEER_ADDRESS=peer0.$ORG.example.com:$P CORE_PEER_LISTENADDRESS=0.0.0.0:$P
export CORE_PEER_CHAINCODEADDRESS=peer0.$ORG.example.com:$((P+1)) CORE_PEER_CHAINCODELISTENADDRESS=0.0.0.0:$((P+1))
export CORE_PEER_GOSSIP_BOOTSTRAP=peer0.$ORG.example.com:$P CORE_PEER_GOSSIP_EXTERNALENDPOINT=peer0.$ORG.example.com:$P
export CORE_PEER_LOCALMSPID=Org${1}MSP CORE_PEER_MSPCONFIGPATH=$D/msp
export CORE_PEER_TLS_ENABLED=true CORE_PEER_TLS_CERT_FILE=$D/tls/server.crt CORE_PEER_TLS_KEY_FILE=$D/tls/server.key CORE_PEER_TLS_ROOTCERT_FILE=$D/tls/ca.crt
export CORE_PEER_FILESYSTEMPATH=$N/data/$ORG CORE_OPERATIONS_LISTENADDRESS=0.0.0.0:$((P+2400)) CORE_METRICS_PROVIDER=disabled
export CORE_PEER_PROFILE_ENABLED=false CORE_CHAINCODE_EXECUTETIMEOUT=60s
exec $B/bin/peer node start
