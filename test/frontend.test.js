import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const html = await fs.readFile(new URL("../public/index.html", import.meta.url), "utf8");
const js = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
const locales = await fs.readFile(new URL("../public/locales.js", import.meta.url), "utf8");
const localeData = vm.runInNewContext(`${locales}\n;({ locales: TOKENSBURNED_LOCALES, harnesses: TOKENSBURNED_HARNESS_LOCALES })`);
const demoCard = await fs.readFile(new URL("../public/demo/card-full.svg", import.meta.url), "utf8");

test("landing page declares privacy policy and ships a fictional demo", () => {
  assert.match(html, /Content-Security-Policy/);
  const moduleScripts = [...html.matchAll(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/g)]
    .map((match) => new URL(match[1], "https://preview.example/index.html"));
  assert.ok(moduleScripts.some((url) => url.origin === "https://preview.example" && url.pathname === "/app.js"),
    "the page must load its local application module regardless of its cache-busting version");
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.doesNotMatch(html, /v1\/cards\/u\/parsifal1986|value="parsifal1986"/);
  assert.match(demoCard, /sample-user/);
  assert.match(demoCard, /DEMO \/ NOT LIVE/);
  assert.doesNotMatch(demoCard, /parsifal1986/i);
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

test("usage limits page has complete translations and working section targets", async () => {
  const limitsHtml = await fs.readFile(new URL("../public/limits.html", import.meta.url), "utf8");
  const limitsLocales = await fs.readFile(new URL("../public/limits-locales.js", import.meta.url), "utf8");
  const messages = vm.runInNewContext(`${limitsLocales}\n;TOKENSBURNED_LIMITS_LOCALES`);
  const keys = [...limitsHtml.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(Object.keys(messages).sort(), Object.keys(localeData.locales).sort());
  for (const [language, translated] of Object.entries(messages)) {
    for (const key of keys) {
      assert.ok(translated[key] || localeData.locales[language][key], `${language} is missing ${key}`);
    }
    assert.deepEqual(Object.keys(translated).sort(), Object.keys(messages.en).sort());
  }
  for (const [, anchor] of limitsHtml.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(limitsHtml.includes(`id="${anchor}"`), `Missing section ${anchor}`);
  }
  assert.match(html, /href="\.\/limits\.html"/);
  assert.match(limitsHtml, /Content-Security-Policy/);
});

test("install commands use the published npm package, never a moving git ref (B8)", async () => {
  const files = ["../public/app.js", "../public/index.html", "../README.md",
    ...["es", "fr", "ja", "ko", "zh-CN"].map((language) => `../docs/readme/README.${language}.md`)];
  for (const file of files) {
    const content = await fs.readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(content, /npm install -g github:/, `${file} must not install from a git ref`);
  }
  assert.match(js, /npm install -g tokensburned/);
});

test("documentation and the site no longer advertise the disabled OTLP path (C5)", async () => {
  const files = ["../public/app.js", "../public/index.html", "../public/locales.js", "../README.md", "../GEMINI.md",
    ...["es", "fr", "ja", "ko", "zh-CN"].map((language) => `../docs/readme/README.${language}.md`)];
  for (const file of files) {
    const content = await fs.readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(content, /tokensburned:telemetry|OTEL_EXPORTER_OTLP_ENDPOINT\s*=/i, `${file} must not guide users to the disabled exporter path`);
  }
  await assert.rejects(() => fs.access(new URL("../commands/tokensburned/telemetry.toml", import.meta.url)));
  assert.doesNotMatch(html, /harnessOtlp|harnessExtensionOtlp/);
});
