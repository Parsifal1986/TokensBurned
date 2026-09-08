import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import readline from "node:readline";

export const inUsageWindow = (timestamp, now, days) => Number.isFinite(timestamp)
  && timestamp <= now && timestamp >= now - Math.min(90, Math.max(1, days)) * 86_400_000;

// Only traverse the selected history roots; never follow directory/file symlinks.
export async function usageFiles(root, accept, minimumMtime = 0) {
  const files = [], pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    let entries;
    try {
      if ((await fs.lstat(directory)).isSymbolicLink()) continue;
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile() && accept(file) && (await fs.stat(file)).mtimeMs >= minimumMtime) files.push(file);
    }
  }
  return files.sort();
}

export async function readUsageJson(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) {
    // Active hosts can be rewriting their JSON; retry on the next scan.
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function* usageJsonLines(file) {
  const lines = readline.createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) {
    try { yield JSON.parse(line); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
}
