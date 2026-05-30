import { readFile } from "node:fs/promises";
import { extname, normalize, resolve } from "node:path";

export const RESPONSE_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

const STATIC_ASSET_PATTERN = /\/[^/?]+\.[^/]+$/;

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

const decodeRouteParam = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const isSafeStaticPath = (pathname: string) => {
  const decodedPath = decodeRouteParam(pathname);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  return !normalizedPath.includes("\0");
};

const toStaticFilePath = (distDir: string, pathname: string) => {
  if (!isSafeStaticPath(pathname)) {
    return null;
  }

  const relativePath = decodeRouteParam(pathname).replace(/^\/+/, "");
  const filePath = resolve(distDir, relativePath);
  return filePath.startsWith(distDir) ? filePath : null;
};

const withResponseHeaders = (contentType: string) => {
  const headers = new Headers(RESPONSE_HEADERS);
  headers.set("Content-Type", contentType);
  return headers;
};

const readStaticAsset = async (distDir: string, pathname: string) => {
  const filePath = toStaticFilePath(distDir, pathname);
  if (!filePath) {
    return null;
  }

  try {
    const content = await readFile(filePath);
    const extension = extname(filePath);
    const contentType = mimeTypes[extension] ?? "application/octet-stream";
    return new Response(content, {
      status: 200,
      headers: withResponseHeaders(contentType),
    });
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code;
    if (errorCode === "ENOENT" || errorCode === "ENOTDIR") {
      return null;
    }

    throw error;
  }
};

const isAssetRequest = (pathname: string) => STATIC_ASSET_PATTERN.test(pathname);

export type ProductionAssetHandlerOptions = {
  distDir: string;
  indexHtmlPath: string;
};

export const createProductionAssetHandler = (
  options: ProductionAssetHandlerOptions,
) => {
  return async (pathname: string) => {
    if (isAssetRequest(pathname)) {
      const asset = await readStaticAsset(options.distDir, pathname);
      if (asset) {
        return asset;
      }
    }

    const html = await readFile(options.indexHtmlPath, "utf8");
    return new Response(html, {
      status: 200,
      headers: withResponseHeaders("text/html; charset=utf-8"),
    });
  };
};
