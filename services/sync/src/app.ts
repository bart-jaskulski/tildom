import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createRevisionId } from "./ulid.ts";

type SyncOptions = {
  storageRoot: string;
  appIds: readonly string[];
  maxBytes: number;
  hostedOrigins: readonly string[];
  devOrigins: readonly string[];
};

type Snapshot = {
  revision: string;
  path: string;
};

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const MAX_SNAPSHOTS = 3;
const REVISION_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const TOKEN_HASH_ALGORITHM = "sha256";

const readCsv = (value: string | undefined, fallback: readonly string[]) =>
  (value ? value.split(",") : [...fallback])
    .map((item) => item.trim())
    .filter(Boolean);

export const createDefaultOptions = (): SyncOptions => ({
  storageRoot: resolve(process.env.SYNC_STORAGE_ROOT ?? "./storage/vaults"),
  appIds: readCsv(process.env.SYNC_APP_IDS, ["mark"]),
  maxBytes: Number.parseInt(process.env.SYNC_MAX_BYTES ?? String(DEFAULT_MAX_BYTES), 10),
  hostedOrigins: readCsv(process.env.SYNC_HOSTED_ORIGINS, ["https://mark.tildom.app"]),
  devOrigins: readCsv(process.env.SYNC_DEV_ORIGINS, [
    "http://localhost:5173",
    "https://localhost:5173",
    "http://127.0.0.1:5173",
    "https://127.0.0.1:5173",
  ]),
});

const isAllowedOrigin = (origin: string, options: SyncOptions) => {
  if (options.devOrigins.includes(origin) || options.hostedOrigins.includes(origin)) {
    return true;
  }

  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && hostname.endsWith(".tildom.app");
  } catch {
    return false;
  }
};

const isSafeSegment = (value: string | undefined) => value !== undefined && SEGMENT_PATTERN.test(value);

const isInside = (root: string, candidate: string) => {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

const resolveVaultDir = (options: SyncOptions, appId: string, vaultId: string) => {
  if (!options.appIds.includes(appId) || !isSafeSegment(appId) || !isSafeSegment(vaultId)) {
    return null;
  }

  const dir = resolve(options.storageRoot, appId, vaultId);
  return isInside(options.storageRoot, dir) ? dir : null;
};

const tokenHash = (token: string) => createHash(TOKEN_HASH_ALGORITHM).update(token).digest("base64url");

const parseBearer = (header: string | undefined) => {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return match?.[1] ?? null;
};

const safeEqual = (left: string, right: string) => {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
};

const authPath = (vaultDir: string) => resolve(vaultDir, ".auth");

const authorizeExistingVault = async (vaultDir: string, token: string | null) => {
  if (!token) {
    return false;
  }

  try {
    const expected = (await readFile(authPath(vaultDir), "utf8")).trim();
    return safeEqual(expected, tokenHash(token));
  } catch {
    return false;
  }
};

const writeAuthIfMissing = async (vaultDir: string, token: string) => {
  try {
    await stat(authPath(vaultDir));
  } catch {
    await writeFile(authPath(vaultDir), `${tokenHash(token)}\n`, { flag: "wx" });
  }
};

const readRequestBody = async (request: Request, maxBytes: number) => {
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (!Number.isNaN(contentLength) && contentLength > maxBytes) {
    return null;
  }

  const body = new Uint8Array(await request.arrayBuffer());
  return body.byteLength <= maxBytes ? body : null;
};

const listSnapshots = async (vaultDir: string): Promise<Snapshot[]> => {
  let entries;
  try {
    entries = await readdir(vaultDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".bin"))
    .map((entry) => entry.name.slice(0, -4))
    .filter((revision) => REVISION_PATTERN.test(revision))
    .sort()
    .map((revision) => ({ revision, path: resolve(vaultDir, `${revision}.bin`) }));
};

const latestRevision = async (vaultDir: string) => (await listSnapshots(vaultDir)).at(-1) ?? null;

const pruneSnapshots = async (vaultDir: string) => {
  const snapshots = await listSnapshots(vaultDir);
  const stale = snapshots.slice(0, Math.max(0, snapshots.length - MAX_SNAPSHOTS));

  await Promise.all(stale.map((snapshot) => rm(snapshot.path, { force: true })));
};

const vaultLocks = new Map<string, Promise<void>>();

const withVaultLock = async <T>(key: string, fn: () => Promise<T>) => {
  const previous = vaultLocks.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  const cleanup = run.then(() => undefined, () => undefined).finally(() => {
    if (vaultLocks.get(key) === cleanup) {
      vaultLocks.delete(key);
    }
  });
  vaultLocks.set(key, cleanup);
  return run;
};

const buckets = new Map<string, { count: number; resetAt: number }>();

const rateLimit = (request: Request, write: boolean) => {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = `${write ? "w" : "r"}:${forwarded || "local"}`;
  const now = Date.now();
  const max = write ? 30 : 120;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= max) {
    return null;
  }

  return new Response("Too many requests", {
    status: 429,
    headers: { "Retry-After": String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))) },
  });
};

const snapshotHeaders = (revision: string) => ({
  "Content-Type": "application/octet-stream",
  "ETag": revision,
  "X-Tildom-Revision": revision,
});

export const createSyncApp = (options = createDefaultOptions()) => {
  const app = new Hono();

  app.use(
    "/v1/*",
    cors({
      origin: (origin) => (origin && isAllowedOrigin(origin, options) ? origin : null),
      allowHeaders: ["Authorization", "Content-Type", "If-Match", "If-None-Match"],
      exposeHeaders: ["ETag", "X-Tildom-Revision"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );

  app.get("/health", (context) => context.json({ ok: true }));

  app.use("/v1/*", async (context, next) => {
    const limited = rateLimit(context.req.raw, context.req.method === "POST");
    if (limited) {
      return limited;
    }

    await next();
  });

  app.get("/v1/apps/:appId/vaults/:vaultId/snapshots", async (context) => {
    const vaultDir = resolveVaultDir(options, context.req.param("appId"), context.req.param("vaultId"));
    if (!vaultDir) {
      return context.json({ error: "Not found" }, 404);
    }

    const token = parseBearer(context.req.header("authorization"));
    if (!(await authorizeExistingVault(vaultDir, token))) {
      return context.json({ error: "Not found" }, 404);
    }

    return context.json({ revisions: (await listSnapshots(vaultDir)).map((item) => item.revision).reverse() });
  });

  app.get("/v1/apps/:appId/vaults/:vaultId/snapshots/latest", async (context) => {
    const vaultDir = resolveVaultDir(options, context.req.param("appId"), context.req.param("vaultId"));
    if (!vaultDir) {
      return context.json({ error: "Not found" }, 404);
    }

    const token = parseBearer(context.req.header("authorization"));
    if (!(await authorizeExistingVault(vaultDir, token))) {
      return context.json({ error: "Not found" }, 404);
    }

    const snapshot = await latestRevision(vaultDir);
    if (!snapshot) {
      return context.json({ error: "Not found" }, 404);
    }

    return context.body(await readFile(snapshot.path), 200, snapshotHeaders(snapshot.revision));
  });

  app.get("/v1/apps/:appId/vaults/:vaultId/snapshots/:revision", async (context) => {
    const vaultDir = resolveVaultDir(options, context.req.param("appId"), context.req.param("vaultId"));
    const revision = context.req.param("revision");
    if (!vaultDir || !REVISION_PATTERN.test(revision)) {
      return context.json({ error: "Not found" }, 404);
    }

    const token = parseBearer(context.req.header("authorization"));
    if (!(await authorizeExistingVault(vaultDir, token))) {
      return context.json({ error: "Not found" }, 404);
    }

    const path = resolve(vaultDir, `${revision}.bin`);
    if (!isInside(vaultDir, path)) {
      return context.json({ error: "Not found" }, 404);
    }

    try {
      return context.body(await readFile(path), 200, snapshotHeaders(revision));
    } catch {
      return context.json({ error: "Not found" }, 404);
    }
  });

  app.post("/v1/apps/:appId/vaults/:vaultId/snapshots", async (context) => {
    const appId = context.req.param("appId");
    const vaultId = context.req.param("vaultId");
    const vaultDir = resolveVaultDir(options, appId, vaultId);
    const token = parseBearer(context.req.header("authorization"));
    if (!vaultDir || !token) {
      return context.json({ error: "Unauthorized" }, 401);
    }

    const body = await readRequestBody(context.req.raw, options.maxBytes);
    if (!body || body.byteLength === 0) {
      return context.json({ error: "Payload too large or empty" }, body ? 400 : 413);
    }

    return withVaultLock(`${appId}/${vaultId}`, async () => {
      await mkdir(vaultDir, { recursive: true });

      const hasAuth = await authorizeExistingVault(vaultDir, token);
      const snapshots = await listSnapshots(vaultDir);
      const latest = snapshots.at(-1)?.revision ?? null;
      const ifNoneMatch = context.req.header("if-none-match");
      const ifMatch = context.req.header("if-match");

      if (!hasAuth && (latest || ifNoneMatch !== "*")) {
        return context.json({ error: "Conflict", revision: latest }, 409);
      }

      if (hasAuth && (latest ? ifMatch !== latest : ifNoneMatch !== "*")) {
        return context.json({ error: "Conflict", revision: latest }, 409);
      }

      if (!hasAuth) {
        await writeAuthIfMissing(vaultDir, token);
      }

      const revision = createRevisionId();
      const finalPath = resolve(vaultDir, `${revision}.bin`);
      const tempPath = resolve(vaultDir, `.${revision}.${process.pid}.tmp`);
      await writeFile(tempPath, body);
      await rename(tempPath, finalPath);
      await pruneSnapshots(vaultDir).catch((error: unknown) => {
        console.error(error);
      });

      return context.json({ revision }, 201, snapshotHeaders(revision));
    });
  });

  return app;
};

export const app = createSyncApp();
