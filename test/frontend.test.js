import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const html = await fs.readFile(new URL("../public/index.html", import.meta.url), "utf8");
const css = await fs.readFile(new URL("../public/styles.css", import.meta.url), "utf8");

test("landing page stays within the Taste Skill anti-tell budget", () => {
  assert.doesNotMatch(html, /[—–]/);
  assert.equal((html.match(/class="kicker"/g) || []).length, 2);
  assert.doesNotMatch(html, />0[1-9]</);
  assert.doesNotMatch(html, /class="compatibility"/);
});

test("hero and interaction essentials remain present", () => {
  assert.match(html, /Burn tokens\.<br \/>Ship code\./);
  assert.equal((html.match(/data-copy=/g) || []).length, 2);
  assert.match(html, /aria-live="polite"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:where\(a, button\):focus-visible/);
});
