import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serviceWorkerPath = resolve(root, "src/sw.ts");
const outputPath = resolve(root, "public/sw.js");

await build({
  configFile: false,
  root,
  publicDir: false,
  resolve: {
    alias: {
      "~": resolve(root, "src"),
    },
  },
  build: {
    emptyOutDir: false,
    minify: true,
    outDir: dirname(outputPath),
    lib: {
      entry: serviceWorkerPath,
      formats: ["iife"],
      name: "DoTildomServiceWorker",
      fileName: () => "sw.js",
    },
    rollupOptions: {
      output: {
        entryFileNames: "sw.js",
      },
    },
  },
});
