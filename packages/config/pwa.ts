import { VitePWA, type ManifestOptions } from "vite-plugin-pwa";
import { minimal2023Preset } from "@vite-pwa/assets-generator/config";

type TildomPwaOptions = Pick<
  ManifestOptions,
  "name" | "short_name" | "description" | "theme_color"
> &
  Partial<Pick<ManifestOptions, "share_target">>;

const fullBleedIconPreset = {
  ...minimal2023Preset,
  transparent: {
    ...minimal2023Preset.transparent,
    padding: 0,
    resizeOptions: { fit: "cover" as const, background: "#24292e" },
  },
  maskable: {
    ...minimal2023Preset.maskable,
    padding: 0,
    resizeOptions: { fit: "cover" as const, background: "#24292e" },
  },
  apple: {
    ...minimal2023Preset.apple,
    padding: 0,
    resizeOptions: { fit: "cover" as const, background: "#24292e" },
  },
};

// Workspace apps currently resolve different Vite majors, whose plugin types are nominally incompatible.
// The plugin runtime API is compatible across both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tildomPwa = (manifest: TildomPwaOptions): any =>
  VitePWA({
    strategies: "injectManifest",
    srcDir: "src",
    filename: "sw.ts",
    injectRegister: false,
    manifest: {
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#fafafa",
      ...manifest,
    },
    pwaAssets: {
      preset: fullBleedIconPreset,
      image: "public/icon.svg",
      overrideManifestIcons: true,
    },
    injectManifest: {
      globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
      rollupFormat: "es",
    },
    devOptions: {
      enabled: true,
      type: "module",
      navigateFallback: "/",
    },
  });
