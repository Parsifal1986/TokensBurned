import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { atomicWrite } from "./atomic-write.js";
import { BURN_HOME } from "./constants.js";
import { COLLECTOR_SOURCES } from "./collector.js";

const exec = promisify(execFile);
const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = "Managed by TokensBurned background-service v1";
const xml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const unitString = (value, expand = false) => '"' + String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%").replaceAll("$", () => expand ? "$$" : "$") + '"';
function safe(value) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("Service paths and environment must not contain control characters");
  return value;
}
async function read(file) {
  try { return await fs.readFile(file, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function unloadLaunchAgent(run, target) {
  await run("launchctl", ["bootout", target]);
  // launchctl can acknowledge bootout while the process is still exiting.
  // Do not replace its runtime or claim it stopped until the job disappears.
  for (let attempt = 0; attempt < 150; attempt++) {
    try { await run("launchctl", ["print", target]); }
    catch { return; }
    await delay(200);
  }
  throw new Error("Background collector is still stopping; retry after it exits");
}

export function serviceDefinition({ platform = process.platform, home = os.homedir(), burnHome = BURN_HOME,
  node = process.execPath, runtime, harnesses = COLLECTOR_SOURCES, env = process.env, uid = process.getuid?.() } = {}) {
  if (!["darwin", "linux"].includes(platform)) throw new Error("Background startup supports macOS launchd and Linux user systemd. Use run --foreground on this platform.");
  if (!Array.isArray(harnesses) || !harnesses.length || harnesses.some(id => !COLLECTOR_SOURCES.includes(id))) throw new Error("Unsupported collector source");
  for (const value of [home, burnHome, node, runtime]) { safe(value); if (!path.isAbsolute(value)) throw new Error("Service paths must be absolute"); }
  const suffix = createHash("sha256").update(burnHome).digest("hex").slice(0, 12);
  const id = `com.tokensburned.collector.${suffix}`;
  const args = [node, path.join(runtime, "bin", "burn.js"), "_collector", "--harness", [...new Set(harnesses)].join(",")];
  // Never persist shell environment, NODE_OPTIONS, provider keys or device tokens.
  const environment = { HOME: home, BURN_HOME: burnHome, PATH: [path.dirname(node), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":"), NO_COLOR: "1" };
  for (const key of ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "OPENCODE_DB", "GEMINI_CLI_HOME", "CLINE_DIR", "CLINE_DATA_DIR", "CLINE_SESSION_DATA_DIR", "CLINE_IDE_STORAGE"]) if (env[key]) environment[key] = safe(env[key]);
  if (platform === "darwin") {
    if (!Number.isInteger(uid) || uid < 0) throw new Error("A logged-in user is required for launchd");
    const file = path.join(home, "Library", "LaunchAgents", `${id}.plist`);
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<!-- ${MARKER} -->\n<plist version="1.0"><dict>
<key>Label</key><string>${id}</string>
<key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join("")}</array>
<key>EnvironmentVariables</key><dict>${Object.entries(environment).map(([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`).join("")}</dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>60</integer>
<key>ExitTimeOut</key><integer>20</integer>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>/dev/null</string>
<key>StandardErrorPath</key><string>/dev/null</string>
</dict></plist>\n`;
    return { platform, id, file, content, target: `gui/${uid}/${id}`, domain: `gui/${uid}` };
  }
  const file = path.join(home, ".config", "systemd", "user", `${id}.service`);
  const content = `# ${MARKER}\n[Unit]\nDescription=TokensBurned local usage collector\nStartLimitIntervalSec=0\n\n[Service]\nType=simple\nExecStart=${args.map(arg => unitString(arg, true)).join(" ")}\n${Object.entries(environment).map(([key, value]) => `Environment=${unitString(`${key}=${value}`)}`).join("\n")}\nRestart=on-failure\nRestartSec=60\nTimeoutStopSec=20\nUMask=0077\nStandardOutput=null\nStandardError=journal\n\n[Install]\nWantedBy=default.target\n`;
  return { platform, id, file, content, target: `${id}.service` };
}

async function snapshotRuntime(sourceRoot, runtime) {
  await fs.mkdir(runtime, { recursive: true, mode: 0o700 });
  await fs.cp(path.join(sourceRoot, "src"), path.join(runtime, "src"), { recursive: true });
  await fs.cp(path.join(sourceRoot, "bin"), path.join(runtime, "bin"), { recursive: true });
  await atomicWrite(path.join(runtime, "package.json"), JSON.stringify({ private: true, type: "module" }) + "\n");
}

async function installService({ sourceRoot = SOURCE_ROOT, platform = process.platform, home = os.homedir(), burnHome = BURN_HOME,
  command = exec, snapshot = snapshotRuntime, ...options } = {}) {
  const runtime = path.join(burnHome, "service-runtimes", randomUUID());
  const definition = serviceDefinition({ platform, home, burnHome, runtime, ...options });
  const recordFile = path.join(burnHome, "background-service.json");
  const previous = await read(definition.file);
  if (previous !== null && !previous.includes(MARKER)) throw new Error("Refusing to replace an unmanaged service definition");
  await snapshot(sourceRoot, runtime);
  const run = (cmd, args) => command(cmd, args, { timeout: 30_000, maxBuffer: 256 * 1024 });
  let loaded = false;
  if (platform === "darwin") {
    try { await run("launchctl", ["print", definition.target]); loaded = true; } catch { /* Not currently loaded. */ }
  }
  try {
    if (loaded) await unloadLaunchAgent(run, definition.target);
    await fs.mkdir(path.dirname(definition.file), { recursive: true, mode: 0o700 });
    await atomicWrite(definition.file, definition.content);
    if (platform === "darwin") {
      await run("launchctl", ["enable", definition.target]);
      await run("launchctl", ["bootstrap", definition.domain, definition.file]);
      await run("launchctl", ["print", definition.target]);
    } else {
      await run("systemctl", ["--user", "daemon-reload"]);
      await run("systemctl", ["--user", "enable", definition.target]);
      await run("systemctl", ["--user", "restart", definition.target]);
      await run("systemctl", ["--user", "is-active", "--quiet", definition.target]);
    }
    await atomicWrite(recordFile, JSON.stringify({ version: 1, platform, id: definition.id, file: definition.file,
      runtime, harnesses: options.harnesses || COLLECTOR_SOURCES, installed_at: new Date().toISOString() }) + "\n");
  } catch (error) {
    // Restore the previous definition; never leave a failed upgrade pointing at
    // half-installed code. Keep the new snapshot if rollback cannot be verified.
    try {
      if (platform === "darwin") { try { await unloadLaunchAgent(run, definition.target); } catch {} }
      else { try { await run("systemctl", ["--user", "disable", "--now", definition.target]); } catch {} }
      if (previous !== null) await atomicWrite(definition.file, previous);
      else await fs.unlink(definition.file).catch(() => {});
      if (platform === "darwin" && previous !== null && loaded) await run("launchctl", ["bootstrap", definition.domain, definition.file]);
      if (platform === "linux") {
        await run("systemctl", ["--user", "daemon-reload"]);
        if (previous !== null) await run("systemctl", ["--user", "enable", "--now", definition.target]);
      }
    } catch { throw new Error("Background service installation and rollback failed; run doctor and retry run. Runtime snapshots were preserved.", { cause: error }); }
    throw new Error("Background startup failed; previous service definition was restored. Check your user service manager.", { cause: error });
  }
  return { id: definition.id, file: definition.file, runtime };
}

async function stopService({ platform = process.platform, home = os.homedir(), burnHome = BURN_HOME, command = exec, ...options } = {}) {
  const recordFile = path.join(burnHome, "background-service.json");
  const raw = await read(recordFile);
  if (!raw) return { stopped: false };
  const record = JSON.parse(raw);
  const definition = serviceDefinition({ platform, home, burnHome, runtime: record.runtime, ...options });
  if (record.id !== definition.id || record.file !== definition.file) throw new Error("Service ownership does not match this BURN_HOME");
  const content = await read(definition.file);
  if (content !== null && !content.includes(MARKER)) throw new Error("Refusing to remove an unmanaged service definition");
  const run = (cmd, args) => command(cmd, args, { timeout: 30_000, maxBuffer: 256 * 1024 });
  if (platform === "darwin") {
    let loaded = false;
    try { await run("launchctl", ["print", definition.target]); loaded = true; } catch {}
    if (loaded) await unloadLaunchAgent(run, definition.target);
  } else await run("systemctl", ["--user", "disable", "--now", definition.target]);
  if (content !== null) await fs.unlink(definition.file);
  if (platform === "linux") await run("systemctl", ["--user", "daemon-reload"]);
  await fs.unlink(recordFile);
  return { stopped: true };
}

async function serialized(options, action) {
  const file = path.join(options.burnHome || BURN_HOME, "background-service.lock");
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  let handle;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { handle = await fs.open(file, "wx", 0o600); break; }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      let holder;
      try { holder = JSON.parse(await read(file)); } catch {}
      let alive = false;
      if (Number.isInteger(holder?.pid) && holder.pid > 0) {
        try { process.kill(holder.pid, 0); alive = true; } catch (e) { alive = e.code === "EPERM"; }
      }
      const stat = await fs.stat(file).catch(() => null);
      if (alive || stat && Date.now() - stat.mtimeMs < 60_000) throw new Error("Background service operation already in progress");
      await fs.unlink(file).catch(() => {});
    }
  }
  if (!handle) throw new Error("Background service lock is busy");
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid }));
    return await action(options);
  } finally { await handle.close(); await fs.unlink(file).catch(() => {}); }
}
export const installBackgroundService = (options = {}) => serialized(options, installService);
export const stopBackgroundService = (options = {}) => serialized(options, stopService);
