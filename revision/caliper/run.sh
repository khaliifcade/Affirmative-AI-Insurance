#!/bin/bash
unset HTTPS_PROXY HTTP_PROXY https_proxy http_proxy GRPC_PROXY grpc_proxy ALL_PROXY all_proxy GLOBAL_AGENT_HTTPS_PROXY npm_config_https_proxy
export NO_PROXY=localhost,127.0.0.1,.example.com no_proxy=localhost,127.0.0.1,.example.com
cd /home/claude/fab/caliper
npx caliper launch manager --caliper-workspace . --caliper-networkconfig networkconfig.yaml --caliper-benchconfig $1 --caliper-flow-only-test --caliper-report-path report-$2.html --caliper-fabric-timeout-invokeorquery 120
