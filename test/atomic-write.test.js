import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { atomicWrite } from "../src/atomic-write.js";

async function directory(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "burn-atomic-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test("secret writes reject a pre-existing temporary symlink", async (t) => {
  const dir = await directory(t);
  const file = path.join(dir, "credentials.json");
  const target = path.join(dir, "public.txt");
  await fs.writeFile(target, "unchanged", { mode: 0o644 });
  t.mock.method(crypto, "randomUUID", () => "collision");
  const temporary = `${file}.${process.pid}.collision.tmp`;
  await fs.symlink(target, temporary);
  await assert.rejects(atomicWrite(file, "private credential"), { code: "EEXIST" });
  assert.equal(await fs.readFile(target, "utf8"), "unchanged");
  assert.ok((await fs.lstat(temporary)).isSymbolicLink());
});

test("concurrent writes produce one complete private file without leftover secrets", async (t) => {
  const dir = await directory(t);
  const file = path.join(dir, "credentials.json");
  await fs.writeFile(file, "old", { mode: 0o644 });
  const contents = Array.from({ length: 20 }, (_, index) => JSON.stringify({ index, data: "x".repeat(8192) }));
  await Promise.all(contents.map((content) => atomicWrite(file, content)));
  assert.ok(contents.includes(await fs.readFile(file, "utf8")));
  if (process.platform !== "win32") assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.deepEqual(await fs.readdir(dir), ["credentials.json"]);
});

test("failed replacement removes its temporary secret file", async (t) => {
  const dir = await directory(t);
  const destination = path.join(dir, "existing-directory");
  await fs.mkdir(destination);
  await assert.rejects(atomicWrite(destination, "private credential"));
  assert.deepEqual(await fs.readdir(dir), ["existing-directory"]);
});
