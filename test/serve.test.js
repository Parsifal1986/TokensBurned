import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createStaticServer } from "../scripts/serve.js";

test("preview server contains malformed requests and refuses files outside the public directory", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "burn-serve-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, "public");
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, "index.html"), "home");
  await fs.writeFile(path.join(dir, "secret.txt"), "private");
  await fs.symlink(path.join(dir, "secret.txt"), path.join(root, "escape.txt"));
  const server = createStaticServer(root).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = (pathname, method = "GET") => new Promise((resolve, reject) => {
    http.request({ hostname: "127.0.0.1", port: server.address().port, path: pathname, method }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on("error", reject).end();
  });
  for (const pathname of ["http://[", "/%zz", "/%00"]) assert.equal((await request(pathname)).status, 400);
  for (const pathname of ["/escape.txt", "/..%2fsecret.txt"]) {
    const result = await request(pathname);
    assert.equal(result.status, 403);
    assert.doesNotMatch(result.body, /private/);
  }
  assert.equal((await request("/", "POST")).status, 405);
  const healthy = await request("/");
  assert.equal(healthy.status, 200);
  assert.equal(healthy.body, "home");
  assert.equal(healthy.headers["x-content-type-options"], "nosniff");
  assert.equal((await request("/", "HEAD")).body, "");
});
