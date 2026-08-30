import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sourceSkills = path.join(root, "skills");
const pluginSkills = path.join(root, "plugins", "tokensburned", "skills");

test("plugin exposes only the three focused TokensBurned skills", async () => {
  const entries = await fs.readdir(pluginSkills, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(names, ["backfill", "connect", "server"]);

  for (const name of names) {
    const [source, bundled] = await Promise.all([
      fs.readFile(path.join(sourceSkills, name, "SKILL.md"), "utf8"),
      fs.readFile(path.join(pluginSkills, name, "SKILL.md"), "utf8"),
    ]);
    assert.equal(bundled, source);
  }
});
