import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig, type UserConfig } from "vite";

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export const ALLOWED_HOSTS = ["bjaskulskis-mac-mini.tailbd11bd.ts.net", "mac.tailbd11bd.ts.net"];

const isTestEnvironment = () =>
  process.env.NODE_ENV === "test" ||
  Boolean(process.env.VITEST) ||
  process.execArgv.includes("--test") ||
  process.argv.includes("--test");

const isExternalHostRequested = () =>
  Boolean(
    process.env.HOST ||
    process.env.HTTPS === "true" ||
    process.env.VITE_HTTPS === "true" ||
    process.argv.includes("--host") ||
    process.argv.some((arg) => arg.startsWith("--host="))
  );

const findRepoRoot = (startDir: string): string => {
  let current = startDir;
  while (current !== "/" && current !== "") {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return resolve(startDir, "../..");
};

export type HttpsConfig = { key: Buffer; cert: Buffer };

const candidatePairs = [
  ["localhost-key.pem", "localhost.pem"],
  ["bjaskulskis-mac-mini.tailbd11bd.ts.net-key.pem", "bjaskulskis-mac-mini.tailbd11bd.ts.net.pem"],
  ["key.pem", "cert.pem"],
];

const findCertInDir = (dir: string): HttpsConfig | undefined => {
  for (const [keyName, certName] of candidatePairs) {
    const keyPath = resolve(dir, keyName);
    const certPath = resolve(dir, certName);
    if (existsSync(keyPath) && existsSync(certPath)) {
      return {
        key: readFileSync(keyPath),
        cert: readFileSync(certPath),
      };
    }
  }
  return undefined;
};

export const resolveHttpsConfig = (
  configUrl: string,
  options?: { force?: boolean }
): HttpsConfig | undefined => {
  if (!options?.force) {
    if (isTestEnvironment() || process.env.HTTPS === "false") {
      return undefined;
    }
  }

  const envKey = process.env.HTTPS_KEY ?? process.env.SSL_KEY;
  const envCert = process.env.HTTPS_CERT ?? process.env.SSL_CERT;
  if (envKey && envCert && existsSync(envKey) && existsSync(envCert)) {
    return {
      key: readFileSync(envKey),
      cert: readFileSync(envCert),
    };
  }

  let appDir: string;
  try {
    appDir = fileURLToPath(new URL(".", configUrl));
  } catch {
    appDir = process.cwd();
  }
  const repoRoot = findRepoRoot(appDir);

  const appCert = findCertInDir(appDir);
  if (appCert) {
    return appCert;
  }

  const externalHost = options?.force || isExternalHostRequested();
  if (externalHost) {
    const rootCert = findCertInDir(repoRoot);
    if (rootCert) {
      return rootCert;
    }

    try {
      const keyPath = resolve(repoRoot, "localhost-key.pem");
      const certPath = resolve(repoRoot, "localhost.pem");
      execSync(
        `mkcert -cert-file "${certPath}" -key-file "${keyPath}" localhost 127.0.0.1 ::1 ${ALLOWED_HOSTS.join(" ")}`,
        { stdio: "ignore" }
      );
      if (existsSync(keyPath) && existsSync(certPath)) {
        return {
          key: readFileSync(keyPath),
          cert: readFileSync(certPath),
        };
      }
    } catch {
      // mkcert not available or failed
    }
  }

  return undefined;
};

export const tildomAppConfig = <T extends UserConfig>(configUrl: string, overrides: T): UserConfig => {
  const https = resolveHttpsConfig(configUrl);

  return mergeConfig({
    resolve: {
      alias: { "~": fileURLToPath(new URL("./src", configUrl)) },
    },
    server: {
      allowedHosts: ALLOWED_HOSTS,
      headers: isolationHeaders,
      proxy: {
        "/sync": {
          target: process.env.SYNC_PROXY_TARGET ?? "http://127.0.0.1:8787",
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/sync/, ""),
        },
      },
      ...(https ? { https } : {}),
    },
    preview: {
      headers: isolationHeaders,
      ...(https ? { https } : {}),
    },
    optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
    assetsInclude: ["**/*.wasm"],
  }, overrides as UserConfig);
};
