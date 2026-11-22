# Revision artefacts (PAPER024563, IJITCS)

- `chaincode/` – provenance chaincode with both claim paths: `FileClaim` (range reads, original design, Algorithm 1)
  and `FileFNOLAndClaim` + `AttestV2` (day-bucketed deterministic keys, Algorithm 2). `npm test` runs the 16 unit tests.
- `caliper/` – Hyperledger Caliper 0.6.0 benchmark (fabric-gateway connector), network scripts for a native
  Fabric v2.5.12 network with three peer organisations and chaincode-as-a-service, `results.json` and the HTML report
  behind Tables 9 and 10.
- `figures/` – script and data used to draw Figs. 1–7 at 300 dpi.

Chaincode definitions benchmarked: `prov_and` (AND('Org1MSP.peer','Org2MSP.peer')) and
`prov_2of3` (OutOf(2,'Org1MSP.peer','Org2MSP.peer','Org3MSP.peer')).
