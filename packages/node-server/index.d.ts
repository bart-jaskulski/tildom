import type { Hono } from "hono";

export type SpaAppOptions = {
  api?: Hono;
  distDir: string;
};

export declare const createSpaApp: (options: SpaAppOptions) => Hono;
