import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const html = await fs.readFile(new URL("../public/index.html", import.meta.url), "utf8");
const css = await fs.readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const js = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
const demoCard = await fs.readFile(new URL("../public/demo/card-full.svg", import.meta.url), "utf8");

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
  assert.match(html, /src="demo\/card-full\.svg"/);
  assert.match(html, /type="submit">Preview live card/);
  assert.doesNotMatch(html, /v1\/cards\/u\/parsifal1986/);
  assert.doesNotMatch(html, /value="parsifal1986"/);
  assert.match(js, /form\.addEventListener\("submit"/);
  assert.match(js, /setPreset\("full"\);\s*showStaticPreview\(\);/);
  assert.doesNotMatch(js, /setPreset\("full"\);\s*updateCard\(\)/);
  assert.match(demoCard, /sample-user/);
  assert.match(demoCard, /STATIC SAMPLE \/ FICTIONAL DATA/);
  assert.doesNotMatch(demoCard, /parsifal1986/i);
  assert.ok((html.match(/data-copy-target=/g) || []).length >= 4);
  assert.match(html, /aria-live="polite"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:where\(a, button, input\):focus-visible/);
  assert.match(css, /\[data-theme="light"\]/);
});
