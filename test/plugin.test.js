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

test("bundled plugin skills match source skills", async () => {
  const entries = await fs.readdir(pluginSkills, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const sourceEntries = await fs.readdir(sourceSkills, { withFileTypes: true });
  const sourceNames = sourceEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.ok(sourceNames.length > 0);
  assert.deepEqual(names, sourceNames);

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
  // The catalog tracks the last release, independently of the development package.
  const stablePlugin = claudeMarketplace.plugins[0];
  assert.match(stablePlugin.version, /^\d+\.\d+\.\d+$/);
  assert.equal(stablePlugin.source.ref, `v${stablePlugin.version}`);
  assert.match(stablePlugin.source.sha, /^[a-f0-9]{40}$/);
  const codexMarketplace = JSON.parse(await fs.readFile(path.join(root,".agents/plugins/marketplace.json"),"utf8"));
  assert.equal(codexMarketplace.plugins[0].source.ref,stablePlugin.source.ref);
  assert.equal(codexMarketplace.plugins[0].source.sha,stablePlugin.source.sha);
  assert.equal(codexMarketplace.plugins[0].source.source,"url");
  assert.equal(stablePlugin.source.source,"github");
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
