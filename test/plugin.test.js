import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { CLIENT_RELEASE } from "../serverless/src/release.js";

const root = path.resolve(import.meta.dirname, "..");
const sourceSkills = path.join(root, "skills");
const pluginSkills = path.join(root, "plugins", "tokensburned", "skills");

test("plugin exposes focused TokensBurned management skills", async () => {
  const entries = await fs.readdir(pluginSkills, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(names, ["backfill", "connect", "doctor", "privacy", "server", "update"]);

  for (const name of names) {
    const [source, bundled] = await Promise.all([
      fs.readFile(path.join(sourceSkills, name, "SKILL.md"), "utf8"),
      fs.readFile(path.join(pluginSkills, name, "SKILL.md"), "utf8"),
    ]);
    assert.equal(bundled, source);
  }
});

test("repository exposes manifests for the supported plugin ecosystems", async () => {
  const [copilot, gemini, claude, claudeMarketplace, codex, pkg] = await Promise.all([
    fs.readFile(path.join(root, ".plugin", "plugin.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(root, "gemini-extension.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(root, ".claude-plugin", "plugin.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(root, ".claude-plugin", "marketplace.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(root, ".codex-plugin", "plugin.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(root, "package.json"), "utf8").then(JSON.parse),
  ]);

  assert.equal(claude.version, pkg.version);
  assert.equal(claudeMarketplace.plugins[0].version, pkg.version);
  assert.equal(codex.version, pkg.version);
  assert.equal(copilot.version, pkg.version);
  assert.equal(gemini.version, pkg.version);
  assert.equal(CLIENT_RELEASE.latest_version, pkg.version);
  assert.equal(copilot.name, "tokensburned");
  assert.equal(copilot.skills, "skills/");
  assert.equal(copilot.commands, "commands/");
  assert.equal(gemini.name, "tokensburned");
  assert.equal(gemini.contextFileName, "GEMINI.md");
  assert.deepEqual(pkg.cline.plugins[0].paths, ["./integrations/cline/plugin.js"]);
  assert.deepEqual(pkg.cline.plugins[0].capabilities, ["hooks"]);
});

test("Cline integration uploads only aggregate usage fields", async () => {
  const source = await fs.readFile(path.join(root, "integrations", "cline", "plugin.js"), "utf8");
  assert.match(source, /context\?\.result\?\.usage/);
  assert.match(source, /\/v1\/ingest\/batch/);
  assert.match(source, /afterRun: uploadUsage/);
  assert.doesNotMatch(source, /context\?\.(prompt|messages|source|files)/);
});

test("Gemini extension ships focused setup commands", async () => {
  const entries = await fs.readdir(path.join(root, "commands", "tokensburned"));
  assert.deepEqual(entries.sort(), [
    "backfill.toml",
    "connect.toml",
    "doctor.toml",
    "privacy.toml",
    "server.toml",
    "telemetry.toml",
    "update.toml",
  ]);
});
