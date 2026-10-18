"""A minimal stand-in for the `genlayer` module so the contract runs under pytest.

It reproduces the parts the contract touches: storage types, decorators, the message
sender and chain time, user errors, and leader/validator consensus. The leader and the
validator each run their own fetch and model call; tests control what each one sees.
"""

import importlib.util
import json
import pathlib
import sys
import types
import typing

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class TreeMap(dict):
    pass


class u256(int):
    pass


class UserError(Exception):
    pass


class Undetermined(Exception):
    """Validators rejected the leader's result (the transaction would be UNDETERMINED)."""


class Return:
    def __init__(self, calldata):
        self.calldata = calldata


class LeaderError:
    def __init__(self, exc):
        self.exc = exc


class Env:
    def __init__(self):
        self.sender = "0x" + "a" * 40
        self.now = "2026-10-01T12:00:00+00:00"
        self.pages = {}
        self.role = None
        self.llm = lambda prompt, role: ""
        self.prompts = []
        self.fetches = []

    def render(self, url, mode="text"):
        self.fetches.append((self.role, url))
        page = self.pages.get(url)
        if callable(page):
            page = page(self.role)
        if isinstance(page, Exception):
            raise page
        if page is None:
            raise RuntimeError("fetch failed")
        return page

    def exec_prompt(self, prompt):
        self.prompts.append((self.role, prompt))
        out = self.llm(prompt, self.role)
        return out if isinstance(out, str) else json.dumps(out)


ENV = Env()


def _run_nondet_unsafe(leader, validator):
    ENV.role = "leader"
    try:
        result = Return(leader())
    except Exception as e:  # leader crashed
        result = LeaderError(e)
    ENV.role = "validator"
    try:
        ok = validator(result)
    finally:
        ENV.role = None
    if not ok:
        raise Undetermined("validators disagreed with the leader")
    return result.calldata


class _Sender:
    @property
    def as_hex(self):
        return ENV.sender


class _Message:
    @property
    def sender_address(self):
        return _Sender()


class _MessageRaw(dict):
    def __getitem__(self, key):
        if key == "datetime":
            return ENV.now
        raise KeyError(key)


class Contract:
    def __new__(cls, *a, **kw):
        obj = super().__new__(cls)
        for name, ann in typing.get_type_hints(cls).items():
            if typing.get_origin(ann) is TreeMap or ann is TreeMap:
                setattr(obj, name, TreeMap())
        return obj


def _identity(fn):
    return fn


gl = types.SimpleNamespace(
    Contract=Contract,
    public=types.SimpleNamespace(write=_identity, view=_identity),
    message=_Message(),
    message_raw=_MessageRaw(),
    vm=types.SimpleNamespace(UserError=UserError, run_nondet_unsafe=_run_nondet_unsafe, Return=Return),
    nondet=types.SimpleNamespace(
        web=types.SimpleNamespace(render=lambda url, mode="text": ENV.render(url, mode)),
        exec_prompt=lambda p: ENV.exec_prompt(p),
    ),
)

fake = types.ModuleType("genlayer")
fake.gl = gl
fake.TreeMap = TreeMap
fake.u256 = u256
fake.__all__ = ["gl", "TreeMap", "u256"]
sys.modules["genlayer"] = fake

_spec = importlib.util.spec_from_file_location("popper_bounty", ROOT / "contracts" / "popper_bounty.py")
pb = importlib.util.module_from_spec(_spec)
sys.modules["popper_bounty"] = pb
_spec.loader.exec_module(pb)


@pytest.fixture
def env():
    global ENV
    fresh = Env()
    ENV.__dict__.clear()
    ENV.__dict__.update(fresh.__dict__)
    return ENV


@pytest.fixture
def contract(env):
    return pb.PopperBounty()
