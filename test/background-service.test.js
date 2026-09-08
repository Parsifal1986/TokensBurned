import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { serviceDefinition, installBackgroundService, stopBackgroundService } from "../src/background-service.js";
const exec = promisify(execFile);
async function fixture(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-service-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const sourceRoot = path.join(home, "source"), burnHome = path.join(home, "data with spaces");
  await fs.mkdir(path.join(sourceRoot, "src"), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, "bin"));
  await fs.writeFile(path.join(sourceRoot, "src", "cli.js"), "export const fixture = true;");
  await fs.writeFile(path.join(sourceRoot, "bin", "burn.js"), "import '../src/cli.js';");
  return { home, burnHome, sourceRoot, uid: 501, harnesses: ["opencode"], env: { DEVICE_TOKEN: "PRIVATE", NODE_OPTIONS: "UNSAFE", OPENCODE_DB: path.join(home, "usage.db") } };
}

test("user service definitions quote paths and persist only an allowlisted environment", async t => {
  const options = await fixture(t);
  const runtime = path.join(options.burnHome, "runtime & <quotes> %n $HOME");
  const mac = serviceDefinition({ ...options, runtime, platform: "darwin" });
  assert.match(mac.content, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(mac.content, /SuccessfulExit<\/key><false\/>/);
  assert.match(mac.content, /&amp; &lt;quotes&gt;/);
  assert.doesNotMatch(mac.content, /PRIVATE|UNSAFE|NODE_OPTIONS|DEVICE_TOKEN/);
  assert.match(mac.content, /<string>_collector<\/string>/);
  if (process.platform === "darwin") {
    const file = path.join(options.home, "test.plist");
    await fs.writeFile(file, mac.content);
    await exec("plutil", ["-lint", file]);
  }
  const linux = serviceDefinition({ ...options, runtime, platform: "linux" });
  assert.match(linux.content, /WantedBy=default.target/);
  assert.match(linux.content, /Restart=on-failure/);
  assert.match(linux.content, /%%n \$\$HOME/);
  assert.doesNotMatch(linux.content, /PRIVATE|UNSAFE/);
  assert.throws(() => serviceDefinition({ ...options, runtime: runtime + "\nExecStart=bad", platform: "linux" }), /control characters/);
  assert.throws(() => serviceDefinition({ ...options, runtime, platform: "win32" }), /run --foreground/);
});

test("launchd install uses stable code, upgrades one job, rolls back failures and removes login startup", async t => {
  const options = await fixture(t);
  let loaded = false, fail = false;
  const calls = [];
  const command = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (args[0] === "print" && !loaded) throw new Error("not found");
    if (args[0] === "bootout") loaded = false;
    if (args[0] === "bootstrap") { if (fail) { fail = false; throw new Error("injected failure"); } loaded = true; }
    return { stdout: "" };
  };
  const opts = { ...options, platform: "darwin", command };
  const first = await installBackgroundService(opts);
  assert.equal(loaded, true);
  assert.equal(await fs.readFile(path.join(first.runtime, "src", "cli.js"), "utf8"), "export const fixture = true;");
  assert.ok(first.runtime.startsWith(options.burnHome + path.sep));
  const original = await fs.readFile(first.file, "utf8");
  const recordFile = path.join(options.burnHome, "background-service.json");
  const record = await fs.readFile(recordFile, "utf8");
  fail = true;
  await assert.rejects(installBackgroundService(opts), /previous service definition was restored/);
  assert.equal(loaded, true);
  assert.equal(await fs.readFile(first.file, "utf8"), original);
  assert.equal(await fs.readFile(recordFile, "utf8"), record);
  const second = await installBackgroundService(opts);
  assert.equal(second.id, first.id);
  assert.notEqual(second.runtime, first.runtime);
  await fs.writeFile(path.join(options.burnHome, "credentials.json"), "PRIVATE");
  assert.equal((await stopBackgroundService(opts)).stopped, true);
  assert.equal(loaded, false);
  await assert.rejects(fs.access(first.file));
  await assert.rejects(fs.access(recordFile));
  assert.equal(await fs.readFile(path.join(options.burnHome, "credentials.json"), "utf8"), "PRIVATE");
  assert.equal((await stopBackgroundService(opts)).stopped, false);
  assert.ok(calls.every(([cmd]) => cmd === "launchctl"));
});

test("systemd uses user scope and refuses unmanaged files or overlapping service operations", async t => {
  const options = await fixture(t), calls = [];
  const opts = { ...options, platform: "linux", command: async (cmd, args) => { calls.push([cmd, ...args]); return { stdout: "" }; } };
  const result = await installBackgroundService(opts);
  assert.ok(calls.every(([cmd, scope]) => cmd === "systemctl" && scope === "--user"));
  assert.ok(calls.some(call => call.includes("enable")));
  assert.ok(calls.some(call => call.includes("restart")));
  await fs.writeFile(result.file, "User owned service");
  await assert.rejects(installBackgroundService(opts), /unmanaged/);
  await assert.rejects(stopBackgroundService(opts), /unmanaged/);
  assert.equal(await fs.readFile(result.file, "utf8"), "User owned service");
  await fs.writeFile(path.join(options.burnHome, "background-service.lock"), JSON.stringify({ pid: process.pid }));
  await assert.rejects(installBackgroundService(opts), /already in progress/);
});
