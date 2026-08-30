#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "plugins", "tokensburned");
const packageMetadata = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));

async function replaceDirectory(name) {
  const destination = path.join(plugin, name);
  await fs.rm(destination, { recursive: true, force: true });
  await fs.cp(path.join(root, name), destination, { recursive: true });
}

await replaceDirectory("src");
await replaceDirectory("bin");
await replaceDirectory("commands");
await replaceDirectory("skills");
await fs.mkdir(path.join(plugin, "scripts"), { recursive: true });
for (const name of ["hook.js", "onboarding.js"]) {
  await fs.copyFile(path.join(root, "scripts", name), path.join(plugin, "scripts", name));
}
await fs.mkdir(path.join(plugin, "hooks"), { recursive: true });
await fs.copyFile(path.join(root, "hooks", "hooks.json"), path.join(plugin, "hooks", "hooks.json"));
await fs.mkdir(path.join(plugin, ".claude-plugin"), { recursive: true });
await fs.copyFile(
  path.join(root, ".claude-plugin", "plugin.json"),
  path.join(plugin, ".claude-plugin", "plugin.json"),
);
await fs.mkdir(path.join(plugin, ".codex-plugin"), { recursive: true });
await fs.copyFile(
  path.join(root, ".codex-plugin", "plugin.json"),
  path.join(plugin, ".codex-plugin", "plugin.json"),
);
await fs.copyFile(path.join(root, "LICENSE"), path.join(plugin, "LICENSE"));
await fs.writeFile(path.join(plugin, "package.json"), `${JSON.stringify({
  name: "tokensburned-plugin-runtime",
  version: packageMetadata.version,
  private: true,
  type: "module",
  bin: { tokensburned: "./bin/burn.js" },
  engines: { node: ">=20" },
}, null, 2)}\n`);

console.log(`Synced plugin runtime to ${plugin}`);
