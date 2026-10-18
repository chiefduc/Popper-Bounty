"""Shared vectors that the browser code must handle identically (see frontend/tests/parity.test.js)."""

import json
import pathlib

import pytest

from conftest import pb

V = json.loads((pathlib.Path(__file__).parent / "vectors.json").read_text())


@pytest.mark.parametrize("url,expected", V["urls"])
def test_url_vectors(url, expected):
    if expected is None:
        with pytest.raises(pb.InputError):
            pb.normalize_url(url)
    else:
        assert pb.normalize_url(url) == expected


@pytest.mark.parametrize("text,hits", V["escape"])
def test_escape_vectors(text, hits):
    assert sorted(pb.escape_hatch_hits(text)) == sorted(hits)


@pytest.mark.parametrize("text,expected", V["text"])
def test_text_vectors(text, expected):
    assert pb.normalize_text(text) == expected
