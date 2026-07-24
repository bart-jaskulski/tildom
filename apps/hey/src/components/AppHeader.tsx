import type { Accessor, Setter } from "solid-js";
import type { Surface } from "../lib/types";
import styles from "./AppHeader.module.css";

type Props = {
  surface: Accessor<Surface>;
  setSurface: Setter<Surface>;
  search: Accessor<string>;
  setSearch: Setter<string>;
  mobileSearchOpen: Accessor<boolean>;
  setMobileSearchOpen: Setter<boolean>;
};

export default function AppHeader(props: Props) {
  let searchInput: HTMLInputElement | undefined;
  const selectSurface = (surface: Surface) => props.setSurface(surface);

  return <header class={styles.topbar}>
    <button class={styles.wordmark} type="button" onClick={() => selectSurface("chats")}>
      <img src="/icon.svg" alt="" />
      <span>tildom</span>
    </button>
    <nav aria-label="Primary">
      <button classList={{ [styles.active]: props.surface() === "chats" }} onClick={() => selectSurface("chats")}>[ chats.db ]</button>
      <button classList={{ [styles.active]: props.surface() === "memory" }} onClick={() => selectSurface("memory")}>[ memory/ ]</button>
      <button classList={{ [styles.active]: props.surface() === "settings" }} onClick={() => selectSurface("settings")}>[ settings.json ]</button>
    </nav>
    <div class={styles.search} data-open={props.mobileSearchOpen() || undefined} role="search">
      <button class={styles.searchToggle} type="button" aria-label={props.mobileSearchOpen() ? "Close search" : "Search chats and memory"} aria-expanded={props.mobileSearchOpen()} onMouseDown={(event) => event.preventDefault()} onClick={() => {
        const open = !props.mobileSearchOpen();
        props.setMobileSearchOpen(open);
        if (open) queueMicrotask(() => searchInput?.focus());
      }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={props.mobileSearchOpen() ? "M6 6l12 12M18 6 6 18" : "m21 21-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"} /></svg>
      </button>
      <input ref={searchInput} type="search" value={props.search()} placeholder="search chats and memory" aria-label="Search chats and memory" onInput={(event) => props.setSearch(event.currentTarget.value)} onBlur={() => !props.search() && props.setMobileSearchOpen(false)} />
    </div>
  </header>;
}
