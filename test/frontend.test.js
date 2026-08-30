import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const html = await fs.readFile(new URL("../public/index.html", import.meta.url), "utf8");
const css = await fs.readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const js = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
const locales = await fs.readFile(new URL("../public/locales.js", import.meta.url), "utf8");
const localeData = vm.runInNewContext(`${locales}\n;({ locales: TOKENSBURNED_LOCALES, harnesses: TOKENSBURNED_HARNESS_LOCALES })`);
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
  assert.match(html, /name="cardTheme" value="dark" checked/);
  assert.match(html, /id="language-select"/);
  assert.match(html, /id="hero-card-preview" src="demo\/card-full\.svg\?v=theme-2"/);
  assert.doesNotMatch(html, /Preview live card/);
  assert.doesNotMatch(css, /builder-submit/);
  assert.doesNotMatch(html, /v1\/cards\/u\/parsifal1986/);
  assert.doesNotMatch(html, /value="parsifal1986"/);
  assert.match(js, /form\.addEventListener\("submit"/);
  assert.match(js, /data:image\/svg\+xml;charset=utf-8/);
  assert.match(js, /replaceAll\("sample-user"/);
  assert.match(js, /theme: form\.elements\.cardTheme\.value/);
  assert.match(js, /data-card-theme/);
  assert.match(js, /setSvgTheme\(svg\.replaceAll\("sample-user", owner\), options\.theme\)/);
  assert.match(js, /renderHeroPreview\(\)/);
  assert.match(js, /input\[name="cardTheme"\]\[value="\$\{theme\}"\]/);
  assert.doesNotMatch(js, /preview\.src\s*=\s*cardUrl/);
  assert.doesNotMatch(js, /fetch\(cardUrl/);
  assert.match(demoCard, /sample-user/);
  assert.match(demoCard, /STATIC SAMPLE \/ FICTIONAL DATA/);
  assert.match(demoCard, /data-card-theme="auto"/);
  assert.doesNotMatch(demoCard, /parsifal1986/i);
  assert.ok((html.match(/data-copy-target=/g) || []).length >= 4);
  assert.match(html, /aria-live="polite"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:where\(a, button, input, select\):focus-visible/);
  assert.match(css, /\[data-theme="light"\]/);
  for (const language of ["zh-CN", "ja", "ko", "es", "fr"]) {
    assert.match(locales, new RegExp(`(?:"${language}"|${language}):`));
  }
});

test("every visible website string is available in every supported language", () => {
  const keys = [...html.matchAll(/data-i18n(?:-placeholder|-aria-label|-alt)?="([^"]+)"/g)]
    .map((match) => match[1]);
  for (const [language, messages] of Object.entries(localeData.locales)) {
    for (const key of keys) assert.equal(typeof messages[key], "string", `${language} is missing ${key}`);
  }
  for (const language of ["zh-CN", "ja", "ko", "es", "fr"]) {
    assert.deepEqual(Object.keys(localeData.harnesses[language]).sort(), Object.keys(localeData.harnesses["zh-CN"]).sort());
  }
});
