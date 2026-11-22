"""
Reference implementation of the provenance ledger used in the simulation.

It mirrors the properties the Hyperledger Fabric deployment provides
(see fabric/): an ordered, append-only log whose records are
  * hash-chained (SHA-256 over a canonical JSON header),
  * endorsed by a threshold of independent parties (Ed25519 signatures),
  * timestamped by an ordering service (monotonic, not client-supplied),
  * replicated to every consortium member.

A centralised, insured-controlled log is provided as the baseline.
"""
import hashlib
import json
import time
from dataclasses import dataclass, field

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def sha256_hex(obj) -> str:
    if isinstance(obj, (bytes, bytearray)):
        data = bytes(obj)
    else:
        data = json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(data).hexdigest()


class Party:
    def __init__(self, name: str):
        self.name = name
        self._sk = Ed25519PrivateKey.generate()
        self.pk = self._sk.public_key()

    def sign(self, msg: bytes) -> bytes:
        return self._sk.sign(msg)


@dataclass
class Record:
    seq: int
    rtype: str
    key: str
    payload_hash: str
    prev_hash: str
    order_ts: float           # assigned by the orderer (logical clock, days)
    claimed_ts: float         # time the submitter says the event happened
    signatures: dict = field(default_factory=dict)

    def header(self) -> bytes:
        return json.dumps([self.seq, self.rtype, self.key, self.payload_hash,
                           self.prev_hash, self.order_ts, self.claimed_ts],
                          separators=(",", ":")).encode()

    @property
    def hash(self) -> str:
        return hashlib.sha256(self.header()).hexdigest()


class EndorsementError(Exception):
    pass


class ProvenanceLedger:
    GENESIS = "0" * 64

    def __init__(self, parties, threshold: int, sign: bool = True):
        self.parties = {p.name: p for p in parties}
        self.threshold = threshold
        self.sign = sign
        self.chain: list[Record] = []
        self.index: dict[str, list[int]] = {}
        self.clock = 0.0
        # replica heads held by every member (head hash after each commit)
        self.replica_heads = {p: self.GENESIS for p in self.parties}

    # ------------------------------------------------------------ writes
    def advance_clock(self, t: float):
        self.clock = max(self.clock, t)

    def append(self, rtype, key, payload, endorsers, claimed_ts=None):
        endorsers = list(dict.fromkeys(endorsers))
        if len([e for e in endorsers if e in self.parties]) < self.threshold:
            raise EndorsementError(f"{rtype}: {len(endorsers)} endorsers < threshold {self.threshold}")
        rec = Record(seq=len(self.chain), rtype=rtype, key=key,
                     payload_hash=sha256_hex(payload),
                     prev_hash=self.chain[-1].hash if self.chain else self.GENESIS,
                     order_ts=self.clock,
                     claimed_ts=self.clock if claimed_ts is None else claimed_ts)
        if self.sign:
            msg = rec.header()
            rec.signatures = {e: self.parties[e].sign(msg) for e in endorsers}
        else:
            rec.signatures = {e: b"" for e in endorsers}
        self.chain.append(rec)
        self.index.setdefault(key, []).append(rec.seq)
        for p in self.replica_heads:
            self.replica_heads[p] = rec.hash
        return rec

    # ------------------------------------------------------------- reads
    def history(self, key):
        return [self.chain[i] for i in self.index.get(key, [])]

    def verify_record(self, rec: Record) -> bool:
        if not self.sign:
            return len(rec.signatures) >= self.threshold
        ok = 0
        for name, sig in rec.signatures.items():
            try:
                self.parties[name].pk.verify(sig, rec.header())
                ok += 1
            except (InvalidSignature, KeyError):
                pass
        return ok >= self.threshold

    def verify_chain(self) -> bool:
        prev = self.GENESIS
        for rec in self.chain:
            if rec.prev_hash != prev or not self.verify_record(rec):
                return False
            prev = rec.hash
        return True

    def replicas_agree(self) -> bool:
        return len(set(self.replica_heads.values())) == 1

    # ------------------------------------------------ adversary actions
    def tamper_local_copy(self, party: str, seq: int, new_payload):
        """An insider rewrites one historical record in its own replica.

        Returns True if the rewrite would go unnoticed, i.e. never under this
        design: the rewritten record changes the head hash held by `party`,
        which then disagrees with every other replica.
        """
        rec = self.chain[seq]
        forged = Record(**{**rec.__dict__, "payload_hash": sha256_hex(new_payload)})
        # recompute the forged chain head held by the tampering party only
        prev = self.chain[seq - 1].hash if seq else self.GENESIS
        forged.prev_hash = prev
        h = forged.hash
        for r in self.chain[seq + 1:]:
            r2 = Record(**{**r.__dict__, "prev_hash": h})
            h = r2.hash
        self.replica_heads[party] = h
        return self.replicas_agree()


class CentralisedLog:
    """Baseline: a mutable claims/provenance database controlled by the insured."""

    def __init__(self):
        self.rows: dict[str, list[dict]] = {}

    def append(self, key, payload, ts):
        self.rows.setdefault(key, []).append({"ts": ts, "payload": payload})

    def history(self, key):
        return self.rows.get(key, [])

    def overwrite(self, key, idx, payload, ts=None):
        row = self.rows[key][idx]
        row["payload"] = payload
        if ts is not None:
            row["ts"] = ts
        return True   # silent: no integrity signal


def micro_benchmark(n_records=5000, sign=True):
    """Throughput of append and full-chain verification for the Python reference."""
    parties = [Party(p) for p in ("insurer", "insured", "auditor")]
    led = ProvenanceLedger(parties, threshold=2, sign=sign)
    t0 = time.perf_counter()
    for i in range(n_records):
        led.advance_clock(i)
        led.append("model_version", f"sys{i % 500}", {"i": i, "h": sha256_hex(str(i))},
                   ["insurer", "auditor"])
    t_append = time.perf_counter() - t0
    t0 = time.perf_counter()
    ok = led.verify_chain()
    t_verify = time.perf_counter() - t0
    return {"records": n_records, "signed": sign, "chain_valid": ok,
            "append_per_s": n_records / t_append,
            "verify_per_s": n_records / t_verify,
            "append_ms_per_record": 1000 * t_append / n_records,
            "verify_ms_per_record": 1000 * t_verify / n_records}


if __name__ == "__main__":
    print(micro_benchmark(2000, True))
    print(micro_benchmark(2000, False))
