import { For, createSignal, onCleanup, onMount } from "solid-js";
import { VIM_HELP_EVENT, type VimKeymap } from "@tildom/ui";
import styles from "./KeybindHelp.module.css";

export default function KeybindHelp() {
  const [isOpen, setIsOpen] = createSignal(false);
  const [keymaps, setKeymaps] = createSignal<VimKeymap[]>([]);

  onMount(() => {
    const open = (event: Event) => {
      setKeymaps((event as CustomEvent<VimKeymap[]>).detail);
      setIsOpen(true);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (isOpen() && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener(VIM_HELP_EVENT, open);
    window.addEventListener("keydown", closeOnEscape, true);
    onCleanup(() => {
      window.removeEventListener(VIM_HELP_EVENT, open);
      window.removeEventListener("keydown", closeOnEscape, true);
    });
  });

  return (
    <aside class={styles.help} classList={{ [styles.open]: isOpen() }} aria-hidden={!isOpen()} aria-live="polite">
      <div class={styles.title}>Vim keys <button type="button" tabindex={isOpen() ? undefined : -1} onClick={() => setIsOpen(false)} aria-label="Close keyboard shortcuts">×</button></div>
      <dl>
        <For each={keymaps().filter((keymap) => keymap.help)}>{(keymap) => <div><dt>{Array.isArray(keymap.lhs) ? keymap.lhs.join(" / ") : keymap.lhs}</dt><dd>{keymap.help}</dd></div>}</For>
      </dl>
    </aside>
  );
}
