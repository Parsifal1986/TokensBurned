#!/usr/bin/env node

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".ico": "image/vnd.microsoft.icon", ".png": "image/png" };

export function createStaticServer(directory = root) {
  return http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      if (pathname.includes("\0")) throw new Error("Invalid path");
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
      return;
    }
    try {
      const realRoot = await fs.realpath(directory);
      const file = await fs.realpath(path.resolve(realRoot, `.${pathname === "/" ? "/index.html" : pathname}`));
      if (!file.startsWith(`${realRoot}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await fs.readFile(file);
      response.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createStaticServer().listen(port, "127.0.0.1", () => {
    console.log(`Burn landing page: http://127.0.0.1:${port}`);
  });
}
