import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readmes = ["README.md", ...["zh-CN", "ja", "ko", "es", "fr"].map(language => `docs/readme/README.${language}.md`)];
const publicDocs = [...readmes, "SECURITY.md", "CONTRIBUTING.md", "GEMINI.md", "docs/cli-collection.md", "docs/usage-import.md"];

test("public documentation excludes private service implementation and repository details", async () => {
  for (const file of publicDocs) {
    const content = await fs.readFile(path.join(root, file), "utf8");
    assert.doesNotMatch(content, /\bCREATE TABLE\b|\bINSERT INTO\b|\bCloudflare Worker\b|\bD1 database\b|\bR2 bucket\b|SameSite=|HttpOnly|src\/protocol\.js/i, file);
    for (const [, repository] of content.matchAll(/github\.com\/Parsifal1986\/([\w.-]+)/g)) {
      assert.equal(repository.replace(/\.git$/, ""), "TokensBurned", `${file}: reference only the public client repository`);
    }
  }
});

test("README navigation targets and local document links resolve in every language", async () => {
  for (const file of publicDocs) {
    const content = await fs.readFile(path.join(root, file), "utf8");
    const headings = new Set([...content.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) =>
      heading.toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, "").replace(/ /g, "-")));
    const links = [...content.matchAll(/(?:href|src)="([^"]+)"|\]\(([^\s)]+)\)/g)].map(match => match[1] || match[2]);
    for (const link of links) {
      if (/^[a-z]+:/i.test(link)) continue;
      if (link.startsWith("#")) {
        assert.ok(headings.has(decodeURIComponent(link.slice(1))), `${file}: missing anchor ${link}`);
      } else {
        const target = decodeURIComponent(link.split(/[?#]/)[0]);
        if (target) await fs.access(path.resolve(root, path.dirname(file), target));
      }
    }
  }
});
