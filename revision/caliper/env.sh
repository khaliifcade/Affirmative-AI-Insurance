# source env.sh <orgnum>
export NO_PROXY=localhost,127.0.0.1,.example.com,example.com no_proxy=localhost,127.0.0.1,.example.com,example.com; unset HTTPS_PROXY HTTP_PROXY https_proxy http_proxy GRPC_PROXY grpc_proxy ALL_PROXY all_proxy
N=/home/claude/fab/net; export PATH=/home/claude/fab/bin:$PATH FABRIC_CFG_PATH=$N/peercfg
P=$([ $1 = 1 ] && echo 7051 || ([ $1 = 2 ] && echo 9051 || echo 11051))
export CORE_PEER_TLS_ENABLED=true CORE_PEER_LOCALMSPID=Org${1}MSP
export CORE_PEER_TLS_ROOTCERT_FILE=$N/organizations/peerOrganizations/org$1.example.com/peers/peer0.org$1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=$N/organizations/peerOrganizations/org$1.example.com/users/Admin@org$1.example.com/msp
export CORE_PEER_ADDRESS=peer0.org$1.example.com:$P
export ORDERER_CA=$N/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem
