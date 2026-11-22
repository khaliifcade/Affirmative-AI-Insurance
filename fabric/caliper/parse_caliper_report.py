"""Convert Caliper's report.html performance table into results/caliper_summary.csv.

Usage: python parse_caliper_report.py report.html ../../results/caliper_summary.csv
"""
import csv
import re
import sys
from html.parser import HTMLParser


class Tables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables, self._row, self._cell, self._in = [], None, None, False

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.tables.append([])
        elif tag == "tr":
            self._row = []
        elif tag in ("td", "th"):
            self._cell, self._in = "", True

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._row is not None:
            self._row.append(self._cell.strip()); self._in = False
        elif tag == "tr" and self._row is not None and self.tables:
            self.tables[-1].append(self._row); self._row = None

    def handle_data(self, data):
        if self._in:
            self._cell += data


def main(src, dst):
    p = Tables(); p.feed(open(src, encoding="utf-8").read())
    out = []
    for t in p.tables:
        if not t or "Name" not in t[0] or "Throughput (TPS)" not in t[0]:
            continue
        hdr = t[0]
        for row in t[1:]:
            r = dict(zip(hdr, row))
            m = re.match(r"(\w+)-(\d+)tps", r["Name"])
            if not m:
                continue
            out.append({"round": m.group(1), "offered_tps": int(m.group(2)),
                        "succ": r["Succ"], "fail": r["Fail"],
                        "send_tps": r["Send Rate (TPS)"],
                        "avg_latency_s": r["Avg Latency (s)"],
                        "max_latency_s": r["Max Latency (s)"],
                        "throughput_tps": r["Throughput (TPS)"]})
        break
    with open(dst, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
    print(f"{len(out)} rounds -> {dst}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
