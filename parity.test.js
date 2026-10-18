import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeHatchHits, normalizeText, normalizeUrl } from "../src/logic.js";

const V = JSON.parse(readFileSync(new URL("../../tests/vectors.json", import.meta.url), "utf8"));

test("URL vectors match the contract", () => {
  for (const [url, expected] of V.urls) {
    if (expected === null) assert.throws(() => normalizeUrl(url), Error, url);
    else assert.equal(normalizeUrl(url), expected, url);
  }
});

test("escape-hatch vectors match the contract", () => {
  for (const [text, hits] of V.escape) assert.deepEqual(escapeHatchHits(text).sort(), [...hits].sort(), text);
});

test("text normalization vectors match the contract", () => {
  for (const [text, expected] of V.text) assert.equal(normalizeText(text), expected);
});
