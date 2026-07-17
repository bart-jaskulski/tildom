import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const distDir = resolve("dist");
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".wasm": "application/wasm",
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const requestedPath = resolve(distDir, pathname.replace(/^\/+/, ""));
    const isAsset = extname(pathname) !== "";

    if (requestedPath !== distDir && !requestedPath.startsWith(`${distDir}/`)) {
      response.statusCode = 400;
      response.end("Bad request");
      return;
    }

    const filePath = isAsset ? requestedPath : resolve(distDir, "index.html");
    const content = await readFile(filePath);

    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    response.setHeader("Cache-Control", pathname.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "no-cache");
    response.setHeader("Content-Type", mimeTypes[extname(filePath)] ?? "application/octet-stream");
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    response.statusCode = error?.code === "ENOENT" ? 404 : 500;
    response.end(response.statusCode === 404 ? "Not found" : "Internal Server Error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`kin.tildom server listening on http://0.0.0.0:${port}`);
});
