#!/bin/bash
# deploy.sh <name> <port> <policy>
set -e
NAME=$1; PORT=$2; POL=$3; N=/home/claude/fab/net; W=$N/pkg/$NAME; rm -rf $W; mkdir -p $W/src
echo "{\"address\":\"localhost:$PORT\",\"dial_timeout\":\"10s\",\"tls_required\":false}" > $W/src/connection.json
echo "{\"type\":\"ccaas\",\"label\":\"${NAME}_1.0\"}" > $W/metadata.json
(cd $W/src && tar czf ../code.tar.gz connection.json); (cd $W && tar czf $NAME.tgz metadata.json code.tar.gz)
for o in 1 2 3; do (source $N/env.sh $o; peer lifecycle chaincode install $W/$NAME.tgz >/dev/null 2>&1 || true); done
source $N/env.sh 1; PKG=$(peer lifecycle chaincode calculatepackageid $W/$NAME.tgz); echo $PKG > $W/pkgid
cd /home/claude/build/chaincode/provenance
(NO_PROXY=localhost,127.0.0.1 CHAINCODE_SERVER_ADDRESS=0.0.0.0:$PORT CHAINCODE_ID=$PKG nohup npx fabric-chaincode-node server --chaincode-address=0.0.0.0:$PORT --chaincode-id=$PKG > $N/logs/cc_$NAME.log 2>&1 &)
sleep 3
for o in 1 2 3; do (source $N/env.sh $o; peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA --channelID mychannel --name $NAME --version 1.0 --package-id $PKG --sequence 1 --signature-policy "$POL" >/dev/null 2>&1); done
source $N/env.sh 1
OPTS=""; for o in 1 2 3; do P=$([ $o = 1 ] && echo 7051 || ([ $o = 2 ] && echo 9051 || echo 11051)); OPTS="$OPTS --peerAddresses peer0.org$o.example.com:$P --tlsRootCertFiles $N/organizations/peerOrganizations/org$o.example.com/peers/peer0.org$o.example.com/tls/ca.crt"; done
peer lifecycle chaincode commit -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA --channelID mychannel --name $NAME --version 1.0 --sequence 1 --signature-policy "$POL" $OPTS 2>&1 | tail -1
peer lifecycle chaincode querycommitted --channelID mychannel --name $NAME 2>&1 | tail -1
