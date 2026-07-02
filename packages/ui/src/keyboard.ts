import { onMount, onCleanup } from "solid-js";
import { getSharedPreferences } from "./preferences.ts";

export interface VimNavigationOptions {
  onUp?: () => void;
  onDown?: () => void;
  onSearch?: () => void;
  onSave?: () => void;
  onFocusInput?: () => void;
  onEscape?: () => void;
  customCommands?: Record<string, (lastKey?: string) => void>;
}

export function createVimNavigation(options: VimNavigationOptions) {
  onMount(() => {
    let lastKey = "";
    let clearLastKeyTimer: ReturnType<typeof setTimeout> | undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 1. Desktop & Global Enablement Checks
      const isDesktop = !("ontouchstart" in window) && window.innerWidth > 768;
      const isVimEnabled = getSharedPreferences().vimKeys;
      if (!isDesktop || !isVimEnabled) return;

      // 2. Prevent triggers while typing in fields
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
      if (isTyping) {
        if (event.key === "Escape") {
          (activeEl as HTMLElement).blur();
          event.preventDefault();
        }
        return;
      }

      const key = event.key;

      if (key === "Escape") {
        lastKey = "";
        options.onEscape?.();
        event.preventDefault();
        return;
      }

      // Handle combo prefixes: 'g' or ':'
      if (key === "g" && lastKey === "") {
        lastKey = "g";
        if (clearLastKeyTimer) clearTimeout(clearLastKeyTimer);
        clearLastKeyTimer = setTimeout(() => {
          if (lastKey === "g") lastKey = "";
        }, 1000);
        return;
      }

      if (key === ":" && lastKey === "") {
        lastKey = ":";
        if (clearLastKeyTimer) clearTimeout(clearLastKeyTimer);
        clearLastKeyTimer = setTimeout(() => {
          if (lastKey === ":") lastKey = "";
        }, 1000);
        return;
      }

      // Check combo commands first
      if (lastKey === ":" && key === "w") {
        if (options.onSave) {
          event.preventDefault();
          options.onSave();
        }
        lastKey = "";
        return;
      }

      // General Key Handlers
      if (key === "j" || key === "ArrowDown") {
        if (options.onDown) {
          event.preventDefault();
          options.onDown();
        }
        lastKey = "";
        return;
      }

      if (key === "k" || key === "ArrowUp") {
        if (options.onUp) {
          event.preventDefault();
          options.onUp();
        }
        lastKey = "";
        return;
      }

      if (key === "/") {
        if (options.onSearch) {
          event.preventDefault();
          options.onSearch();
        }
        lastKey = "";
        return;
      }

      if (key === "i") {
        if (options.onFocusInput) {
          event.preventDefault();
          options.onFocusInput();
        }
        lastKey = "";
        return;
      }

      // Custom combo/single commands
      const customAction = options.customCommands?.[key];
      if (customAction) {
        customAction(lastKey);
        event.preventDefault();
        lastKey = "";
      } else {
        // Clear last key if no match
        lastKey = "";
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
      if (clearLastKeyTimer) clearTimeout(clearLastKeyTimer);
    });
  });
}
