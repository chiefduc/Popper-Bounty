"""Check SUBMISSION.md form fields against the Project Explorer character limits."""

import pathlib
import re
import sys

LIMITS = {"One-liner": 180, "Description": 1000, "Expected verification outcome": 500}
text = (pathlib.Path(__file__).parent / "SUBMISSION.md").read_text()
ok = True
for name, limit in LIMITS.items():
    m = re.search(rf"^## {re.escape(name)}.*?\n(.*?)(?=^## )", text, re.S | re.M)
    body = m.group(1).strip() if m else ""
    status = "ok" if 0 < len(body) <= limit else "TOO LONG" if body else "MISSING"
    ok &= status == "ok"
    print(f"{name:32} {len(body):5} / {limit}  {status}")
sys.exit(0 if ok else 1)
