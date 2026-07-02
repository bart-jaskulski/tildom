import { For, Show, splitProps } from "solid-js";
import styles from "./Tabline.module.css";

export interface TabItem {
  label: string;
  href: string;
  active: boolean;
}

export interface TablineProps {
  appName: string; // e.g. "do", "mark", "kin" -> will render as `<appName>.tildom`
  tabs: TabItem[];
  search?: {
    value: string;
    placeholder?: string;
    onInput: (value: string) => void;
    onClear?: () => void;
  };
}

export default function Tabline(props: TablineProps) {
  const [local] = splitProps(props, ["appName", "tabs", "search"]);

  return (
    <header class={styles.tabline}>
      <div class={styles.brand}>
        <span class={styles.logo}>~</span>
        <span class={styles.title}>{local.appName}.tildom</span>
      </div>

      <nav class={styles.nav} aria-label="Primary">
        <For each={local.tabs}>
          {(tab) => (
            <a
              href={tab.href}
              class={`${styles.navItem} ${tab.active ? styles.activeTab : ""}`}
            >
              [ {tab.label} ]
            </a>
          )}
        </For>
      </nav>

      <Show when={local.search}>
        {(searchVal) => (
          <div class={styles.search} role="search">
            <input
              type="search"
              value={searchVal().value}
              placeholder={searchVal().placeholder ?? "search"}
              onInput={(e) => searchVal().onInput(e.currentTarget.value)}
            />
            <Show when={searchVal().onClear && searchVal().value}>
              <button
                type="button"
                class={styles.clearBtn}
                onClick={() => searchVal().onClear?.()}
                aria-label="Clear search"
              >
                [X]
              </button>
            </Show>
          </div>
        )}
      </Show>
    </header>
  );
}
