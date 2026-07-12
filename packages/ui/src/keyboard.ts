import { onMount, onCleanup, type Accessor } from "solid-js";
import { getSharedPreferences } from "./preferences.ts";

export const VIM_HELP_EVENT = "tildom:keybind-help";
let activeKeymaps: VimKeymap[] = [];

export type VimKeymap = {
  lhs: string | string[];
  callback: (context: { lhs: string }) => void;
  help?: string;
};

export const showVimHelp = (keymaps = activeKeymaps) =>
  window.dispatchEvent(new CustomEvent<VimKeymap[]>(VIM_HELP_EVENT, { detail: keymaps }));

export const setActiveVimKeymaps = (keymaps: VimKeymap[]) => {
  activeKeymaps = [{ lhs: "?", callback: () => {}, help: "show this help" }, ...keymaps];
};

export type VimKeymaps = VimKeymap[] | Accessor<VimKeymap[]>;

export function createVimNavigation(keymaps: VimKeymaps) {
  onMount(() => {
    const getKeymaps = () => typeof keymaps === "function" ? keymaps() : keymaps;
    const getBindings = () => getKeymaps().flatMap((keymap) =>
      (Array.isArray(keymap.lhs) ? keymap.lhs : [keymap.lhs]).map((lhs) => ({ ...keymap, lhs })),
    );
    let pending = "";
    let clearPendingTimer: ReturnType<typeof setTimeout> | undefined;

    const clearPending = () => {
      pending = "";
      if (clearPendingTimer) clearTimeout(clearPendingTimer);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (window.innerWidth <= 768 || !getSharedPreferences().vimKeys) return;

      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
      if (isTyping) {
        if (event.key === "Escape") {
          (activeEl as HTMLElement).blur();
          event.preventDefault();
        }
        return;
      }

      if (event.key === "?") {
        setActiveVimKeymaps(getKeymaps());
        showVimHelp();
        event.preventDefault();
        return;
      }

      const lhs = `${pending}${event.key}`;
      const bindings = getBindings();
      const exact = bindings.find((keymap) => keymap.lhs === lhs);
      if (exact) {
        exact.callback({ lhs });
        event.preventDefault();
        clearPending();
        return;
      }

      if (bindings.some((keymap) => keymap.lhs.startsWith(lhs))) {
        pending = lhs;
        if (clearPendingTimer) clearTimeout(clearPendingTimer);
        clearPendingTimer = setTimeout(clearPending, 1_000);
        event.preventDefault();
        return;
      }

      clearPending();
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
      if (clearPendingTimer) clearTimeout(clearPendingTimer);
    });
  });
}
