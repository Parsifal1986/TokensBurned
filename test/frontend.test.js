import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const html = await fs.readFile(new URL("../public/index.html", import.meta.url), "utf8");
const css = await fs.readFile(new URL("../public/styles.css", import.meta.url), "utf8");

test("landing page stays within the Taste Skill anti-tell budget", () => {
  assert.doesNotMatch(html, /[—–]/);
  assert.equal((html.match(/class="kicker"/g) || []).length, 1);
  assert.doesNotMatch(html, />0[1-9]</);
  assert.doesNotMatch(html, /class="compatibility"/);
  assert.doesNotMatch(css, /transition:\s*all/);
});

test("hero and interaction essentials remain present", () => {
  assert.match(html, /<title>TokensBurned \| AI coding activity for GitHub<\/title>/);
  assert.match(html, /aria-label="TokensBurned home"/);
  assert.doesNotMatch(html, /<title>Burn \|/);
  assert.match(html, /Your AI coding receipt\./);
  assert.match(html, /id="install"/);
  assert.match(html, /id="card-builder"/);
  assert.match(html, /data-harness="claude"/);
  assert.match(html, /data-harness="gemini"/);
  assert.match(html, /name="preset" value="compact"/);
  assert.ok((html.match(/data-copy-target=/g) || []).length >= 4);
  assert.match(html, /aria-live="polite"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:where\(a, button, input\):focus-visible/);
  assert.match(css, /\[data-theme="light"\]/);
});
