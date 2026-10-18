# Integrating with Popper Bounty

Other contracts, bots and apps can read claim outcomes without trusting the web app. All views return JSON strings.

## `get_status(claim_id)` — for contracts

```json
{
  "id": 3,
  "status": "FALSIFIED",
  "claimant": "0xada0…",
  "bounty": 1000,
  "deadline": 1798588800,
  "winner": "0xb200…",
  "falsifying_url": "https://example.org/harbour-notice-41",
  "falsifying_condition": 1
}
```

`status` is one of `DRAFT`, `OPEN`, `FALSIFIED`, `SURVIVED`, `UNFALSIFIABLE`, `WITHDRAWN`. `winner`, `falsifying_url` and `falsifying_condition` are set only when `FALSIFIED` (`falsifying_condition` is the zero-based index of the condition the source verified). `deadline` is unix seconds of chain time and is `0` until the claim opens.

Terminal states are `FALSIFIED`, `SURVIVED`, `UNFALSIFIABLE` and `WITHDRAWN`; they never change again. Treat `OPEN` as undecided, even after the deadline, until someone calls `close_claim`.

### From another Intelligent Contract

```python
import json
from genlayer import *

class ForecastPayout(gl.Contract):
    popper: Address

    def __init__(self, popper: str):
        self.popper = Address(popper)

    @gl.public.view
    def outcome(self, claim_id: int) -> str:
        raw = gl.get_contract_at(self.popper).view().get_status(claim_id)
        s = json.loads(raw)
        if s["status"] == "FALSIFIED":
            return f"refuted by {s['winner']}"
        if s["status"] == "SURVIVED":
            return "claim held"
        return "undecided"
```

(`gl.get_contract_at(...).view()` is the cross-contract read pattern in the current SDK; check it against your SDK version.)

Example uses: a prediction market that settles on `SURVIVED` / `FALSIFIED`; a grant that releases a milestone only if a claim about it survives; a reputation contract that counts how many of an address's claims survived or were rejected as unfalsifiable.

## `get_claim(claim_id)` — full record

Adds the statement, conditions, `deadline_days`, timestamps (`created_at`, `opened_at`, `resolved_at`), every audit attempt and every challenge:

```json
{
  "audits": [
    {"attempt": 1, "at": 1792400000, "passed": false,
     "conditions": ["…", "…"],
     "rows": [{"VAGUE": true, "UNOBSERVABLE": false, "IRRELEVANT": false, "ESCAPE_HATCH": false, "passed": false}, {…}]}
  ],
  "challenges": [
    {"n": 0, "challenger": "0x…", "url": "https://…", "at": 1792500000,
     "verdict": "FALSIFIES", "condition": 1,
     "rows": [{"status": "PARTIAL", "quote": "…", "verified": true},
              {"status": "MET", "quote": "…exact passage…", "verified": true}]}
  ],
  "falsified_by": 0
}
```

`verified: true` means the quoted passage was found on the page the validators fetched. A `MET` is always verified; unverified claims of `MET` are stored as `PARTIAL` with no quote.

## `list_claims(offset, limit)`

Newest first, `limit` capped at 50: `{"total": 4, "items": [{"id", "title", "claimant", "status", "bounty", "deadline", "challenges", "created_at"}]}`.

## From JavaScript

```js
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const client = createClient({ chain: studionet });
const status = JSON.parse(await client.readContract({
  address: "0xYourPopperBountyAddress",
  functionName: "get_status",
  args: [3],
}));
```
