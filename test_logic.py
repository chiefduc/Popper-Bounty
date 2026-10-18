"""Pure judging logic: validation, parsing, verdicts and validator agreement."""

import json

import pytest

from conftest import pb

CONDS = [
    "Official ONS data shows UK CPI inflation above 4.0% for any month of 2027.",
    "The Bank of England raises Bank Rate above 5.5% at any meeting in 2027.",
]
PAGE = (
    "Consumer price inflation rose to 4.3% in March 2027, the Office for National Statistics "
    "said on Wednesday, the highest reading for two years."
)


def audit_json(*rows):
    return json.dumps({"conditions": [{**{f: False for f in pb.FLAGS}, **r} for r in rows]})


# ---- input validation

def test_valid_inputs_are_cleaned():
    t, s, c, b, d = pb.validate_claim_inputs("  UK inflation  ", "UK inflation stays below 4%\n through 2027.", CONDS, "500", "30")
    assert t == "UK inflation" and "\n" not in s and c == CONDS and b == 500 and d == 30


@pytest.mark.parametrize("conds", [[CONDS[0]], CONDS * 3, [CONDS[0], CONDS[0]], [CONDS[0], "too short"]])
def test_bad_condition_lists_rejected(conds):
    with pytest.raises(pb.InputError):
        pb.validate_conditions(conds)


def test_conditions_accept_json_or_lines():
    assert pb.validate_conditions(json.dumps(CONDS)) == CONDS
    assert pb.validate_conditions("\n".join(CONDS) + "\n\n") == CONDS


def test_duplicate_detection_ignores_case_and_spacing():
    with pytest.raises(pb.InputError):
        pb.validate_conditions([CONDS[0], "  " + CONDS[0].upper()])


@pytest.mark.parametrize("args", [
    ("x", "UK inflation stays below 4% through 2027.", CONDS, 1, 30),
    ("Title", "short", CONDS, 1, 30),
    ("Title", "UK inflation stays below 4% through 2027.", CONDS, -1, 30),
    ("Title", "UK inflation stays below 4% through 2027.", CONDS, 1, 0),
    ("Title", "UK inflation stays below 4% through 2027.", CONDS, 1, 366),
    ("Title", "UK inflation stays below 4% through 2027.", CONDS, "lots", 30),
])
def test_bad_claim_inputs_rejected(args):
    with pytest.raises(pb.InputError):
        pb.validate_claim_inputs(*args)


# ---- URLs

@pytest.mark.parametrize("url,expected", [
    ("https://www.ons.gov.uk/economy/inflation/", "https://www.ons.gov.uk/economy/inflation"),
    ("HTTPS://Example.COM", "https://example.com/"),
    ("https://example.com:443/a?b=1#frag", "https://example.com/a?b=1"),
])
def test_urls_normalized(url, expected):
    assert pb.normalize_url(url) == expected


@pytest.mark.parametrize("url", [
    "http://example.com", "https://localhost/x", "https://127.0.0.1/", "https://10.0.0.5/",
    "https://192.168.1.1", "https://user@example.com/", "https://example.com:8080/",
    "https://intranet", "ftp://example.com", "https://example.com/ a", "https://[::1]/",
    "https://172.20.0.1/", "https://printer.local/", None, "https://x.com/" + "a" * 600,
])
def test_bad_urls_rejected(url):
    with pytest.raises(pb.InputError):
        pb.normalize_url(url)


# ---- JSON extraction

def test_extract_json_handles_fences_and_prose():
    assert pb.extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert pb.extract_json('Sure! {"a": {"b": "}"}} trailing') == {"a": {"b": "}"}}
    assert pb.extract_json("no json here") is None
    assert pb.extract_json('{"a": ') is None
    assert pb.extract_json(42) is None


# ---- audit

def test_escape_phrases_flagged_in_code():
    pre = pb.precheck_conditions(["A peer-reviewed study shows X, unless I find it flawed.", CONDS[0]])
    assert pre == [["ESCAPE_HATCH"], []]


def test_parse_audit_reads_flags():
    rows = pb.parse_audit(audit_json({}, {"VAGUE": True}), 2)
    assert rows[0]["VAGUE"] is False and rows[1]["VAGUE"] is True


@pytest.mark.parametrize("raw", [
    "garbage",
    json.dumps({"conditions": [{}]}),
    json.dumps({"conditions": [{"VAGUE": "no", "UNOBSERVABLE": False, "IRRELEVANT": False, "ESCAPE_HATCH": False}] * 2}),
    json.dumps({"conditions": "all fine"}),
    json.dumps({"verdict": "PASS"}),
])
def test_parse_audit_fails_closed(raw):
    rows = pb.merge_audit(pb.parse_audit(raw, 2), [[], []])
    assert not pb.audit_passed(rows)
    assert all(all(r[f] for f in pb.FLAGS) for r in rows)


def test_precheck_overrides_model():
    rows = pb.merge_audit(pb.parse_audit(audit_json({}, {}), 2), [["ESCAPE_HATCH"], []])
    assert rows[0]["passed"] is False and rows[1]["passed"] is True
    assert not pb.audit_passed(rows)


def test_audits_agree_rules():
    ok = [{"passed": True}] * 3
    bad1 = [{"passed": False}, {"passed": True}, {"passed": True}]
    bad2 = [{"passed": True}, {"passed": False}, {"passed": True}]
    bad3 = [{"passed": False}, {"passed": False}, {"passed": True}]
    assert pb.audits_agree(ok, ok)
    assert not pb.audits_agree(ok, bad1)          # overall outcome differs
    assert not pb.audits_agree(bad1, bad2)        # both fail, but 2 conditions differ (> 3 // 3)
    assert pb.audits_agree(bad1, bad3)            # one condition differs, both fail
    assert not pb.audits_agree("junk", ok)
    assert not pb.audits_agree(ok[:2], ok)


# ---- challenge parsing

def test_met_with_verbatim_quote_counts():
    raw = json.dumps({"conditions": [
        {"status": "MET", "quote": "Consumer price inflation rose to 4.3% in March 2027"},
        {"status": "NOT_MET", "quote": "ignored"},
    ]})
    rows = pb.parse_challenge(raw, 2, PAGE)
    assert rows[0] == {"status": "MET", "quote": "Consumer price inflation rose to 4.3% in March 2027", "verified": True}
    assert rows[1] == {"status": "NOT_MET", "quote": "", "verified": False}
    assert pb.challenge_verdict(rows, True) == "FALSIFIES"
    assert pb.first_met(rows) == 0


def test_quote_matching_tolerates_case_quotes_and_spacing():
    page = "He said “inflation  rose to 4.3%” in March 2027 according to the ONS."
    assert pb.quote_found('He said "Inflation rose to 4.3%" in March 2027', page)


def test_met_with_invented_quote_downgraded():
    raw = json.dumps({"conditions": [
        {"status": "MET", "quote": "Inflation hit 6% in January 2027 says ONS"},
        {"status": "NOT_MET", "quote": ""},
    ]})
    rows = pb.parse_challenge(raw, 2, PAGE)
    assert rows[0]["status"] == "PARTIAL" and rows[0]["verified"] is False and rows[0]["quote"] == ""
    assert pb.challenge_verdict(rows, True) == "DOES_NOT_FALSIFY"


@pytest.mark.parametrize("quote", ["4.3%", "Consumer price ... March 2027", ""])
def test_short_or_elided_quotes_not_verified(quote):
    assert not pb.quote_found(quote, PAGE)


@pytest.mark.parametrize("raw", [
    "I think it falsifies the claim.",
    json.dumps({"conditions": [{"status": "MET", "quote": PAGE[:60]}]}),
    json.dumps({"conditions": [{"status": "TRUE", "quote": ""}, {"status": "MET", "quote": ""}]}),
    json.dumps({"conditions": [{"status": "MET", "quote": 5}, {"status": "MET", "quote": ""}]}),
    json.dumps({"verdict": "FALSIFIES"}),
])
def test_parse_challenge_fails_closed(raw):
    rows = pb.parse_challenge(raw, 2, PAGE)
    assert all(r["status"] == "NOT_MET" for r in rows)
    assert pb.challenge_verdict(rows, True) == "DOES_NOT_FALSIFY"


def test_unreachable_verdict():
    assert pb.challenge_verdict([], False) == "UNREACHABLE"


def _rows(*mets):
    return [{"status": "MET" if m else "NOT_MET", "quote": "", "verified": bool(m)} for m in mets]


def test_challenges_agree_rules():
    a = pb.make_challenge_result(True, _rows(1, 0, 0))
    b = pb.make_challenge_result(True, _rows(1, 1, 0))
    c = pb.make_challenge_result(True, _rows(0, 0, 0))
    u = pb.make_challenge_result(False, [])
    assert pb.challenges_agree(a, a)
    assert pb.challenges_agree(a, b)        # same verdict, one condition differs (3//3 = 1)
    assert not pb.challenges_agree(a, c)    # verdict differs
    assert not pb.challenges_agree(u, a)    # leader could not fetch but validator could
    assert pb.challenges_agree(u, u)
    assert not pb.challenges_agree(None, a)


def test_forged_leader_verdict_rejected():
    forged = {"fetched": True, "rows": _rows(0, 0, 0), "verdict": "FALSIFIES"}
    mine = pb.make_challenge_result(True, _rows(1, 0, 0))
    assert not pb.challenges_agree(forged, mine)


def test_malformed_leader_rows_rejected():
    mine = pb.make_challenge_result(True, _rows(0, 0))
    assert not pb.challenges_agree({"verdict": "DOES_NOT_FALSIFY", "rows": [{}, {}]}, mine)
    assert not pb.challenges_agree({"verdict": "DOES_NOT_FALSIFY", "rows": "x"}, mine)


def test_prompts_fence_user_text():
    p = pb.build_audit_prompt("Claim text", CONDS)
    assert "<<<CLAIM" in p and "2. " + CONDS[1] in p and "exactly 2 items" in p
    q = pb.build_challenge_prompt("Claim text", CONDS, "PAGE BODY")
    assert "<<<PAGE\nPAGE BODY\nPAGE>>>" in q


def test_iso_to_epoch():
    assert pb.iso_to_epoch("1970-01-02T00:00:00Z") == 86400
    assert pb.iso_to_epoch("1970-01-02T00:00:00") == 86400
    assert pb.iso_to_epoch("nonsense") == 0
    assert pb.iso_to_epoch(None) == 0
    assert pb.iso_to_epoch(12) == 12
