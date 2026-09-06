import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
  assert.match(source, /syncUsageEntries/);
  assert.match(source, /afterRun: uploadUsage/);
  assert.doesNotMatch(source, /context\?\.(prompt|messages|source|files)/);
  assert.doesNotMatch(source, /os\.homedir|"\.burn"/, "the integration must not hard-code ~/.burn");
});

test("Cline integration reads credentials from BURN_HOME like the CLI (B6)", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-cline-home-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  await fs.writeFile(path.join(home, "config.json"), JSON.stringify({ server: { enabled: true, api_origin: "https://api.example.test/" } }));
  await fs.writeFile(path.join(home, "credentials.json"), JSON.stringify({
    version: 2, device_token: "tb_live_clinedevice.secret", api_origin: "https://api.example.test",
  }));
  const probe = path.join(home, "probe.mjs");
  await fs.writeFile(probe, `
  const { clineInternals } = await import(${JSON.stringify(path.join(root, "integrations", "cline", "plugin.js"))});
  process.stdout.write(JSON.stringify(await clineInternals.connection()));
  `);
  const { stdout } = await execFileAsync(process.execPath, [probe], { env: { ...process.env, BURN_HOME: home, HOME: path.join(home, "no-such-home") } });
  assert.deepEqual(JSON.parse(stdout), {
    token: "tb_live_clinedevice.secret",
    credentialApiOrigin: "https://api.example.test",
    origin: "https://api.example.test",
  });
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
