import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const dist = resolve(root, "dist");
const require = createRequire(resolve(root, "package.json"));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);

const files = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }))).flat();
};

const assets = (await files(dist))
  .filter((path) => !path.endsWith(`${sep}sw.js`))
  .map((path) => `/${relative(dist, path).split(sep).join("/")}`)
  .sort();

await build({
  configFile: false,
  root,
  publicDir: false,
  define: {
    __PWA_ASSETS__: JSON.stringify(assets),
  },
  resolve: { alias: { "~": resolve(root, "src") } },
  build: {
    emptyOutDir: false,
    minify: true,
    outDir: dist,
    lib: {
      entry: resolve(root, "src/sw.ts"),
      formats: ["iife"],
      name: "TildomServiceWorker",
      fileName: () => "sw.js",
    },
    rollupOptions: { output: { entryFileNames: "sw.js" } },
  },
});
