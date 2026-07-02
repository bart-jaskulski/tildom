import { createSignal, createEffect } from "solid-js";

export interface TildomPreferences {
  vimKeys: boolean;
  theme?: string;
}

const COOKIE_NAME = "tildom_pref";
const DEFAULT_PREFS: TildomPreferences = {
  vimKeys: true,
};

export function getSharedPreferences(): TildomPreferences {
  if (typeof document === "undefined") return DEFAULT_PREFS;
  try {
    const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
    if (match) {
      return { ...DEFAULT_PREFS, ...JSON.parse(decodeURIComponent(match[2])) };
    }
  } catch (e) {
    console.error("Failed to parse preferences cookie", e);
  }
  return DEFAULT_PREFS;
}

export function setSharedPreferences(prefs: TildomPreferences) {
  if (typeof document === "undefined") return;
  const valueString = encodeURIComponent(JSON.stringify(prefs));
  
  // Resolve cookie domain from environment variable if provided
  const envDomain = (import.meta as any).env?.VITE_COOKIE_DOMAIN;
  const domainAttr = envDomain ? `; domain=${envDomain}` : "";
  const maxAge = `; max-age=${60 * 60 * 24 * 365}`; // 1 year
  
  document.cookie = `${COOKIE_NAME}=${valueString}${domainAttr}${maxAge}; path=/; secure; samesite=lax`;
}

export function createPreferences() {
  const [prefs, setPrefs] = createSignal<TildomPreferences>(getSharedPreferences());

  createEffect(() => {
    setSharedPreferences(prefs());
  });

  return [prefs, setPrefs] as const;
}
