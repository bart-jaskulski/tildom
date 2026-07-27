import { A, useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import Search from "lucide-solid/icons/search";
import X from "lucide-solid/icons/x";
import { createEffect, createSignal, onCleanup } from "solid-js";
import styles from "./Tabline.module.css";

type TablineProps = {
  active?: "settings";
};

const SEARCH_DEBOUNCE_MS = 350;

export default function Tabline(props: TablineProps) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = createSignal(String(params.q ?? ""));
  const [mobileSearchOpen, setMobileSearchOpen] = createSignal(false);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchInput: HTMLInputElement | undefined;

  createEffect(() => {
    setSearchQuery(String(params.q ?? ""));
  });

  onCleanup(() => {
    if (searchTimer) {
      clearTimeout(searchTimer);
    }
  });

  const scheduleSearch = (rawQuery: string) => {
    if (searchTimer) {
      clearTimeout(searchTimer);
    }

    searchTimer = setTimeout(() => {
      const query = rawQuery.trim();
      if (location.pathname === "/") {
        setParams({ q: query || undefined, page: undefined }, { replace: true });
        return;
      }

      navigate(query ? `/?q=${encodeURIComponent(query)}` : "/");
    }, SEARCH_DEBOUNCE_MS);
  };

  const openMobileSearch = () => {
    setMobileSearchOpen(true);
    queueMicrotask(() => searchInput?.focus());
  };

  return (
    <header class={styles.topbar}>
      <div class={styles.brand}>
        <A href="/" class={styles.title}>
          <img class={styles.logo} src="/icon.svg" alt="" aria-hidden="true" />
          <span>tildom</span>
        </A>
      </div>

      <nav class={styles.nav} aria-label="Primary">
        <A href="/" aria-current={!props.active ? "page" : undefined}>[ bookmarks.db ]</A>
        <A href="/settings" aria-current={props.active === "settings" ? "page" : undefined}>[ settings.json ]</A>
      </nav>

      <div class={styles.search} data-open={mobileSearchOpen() || undefined} role="search">
        <button
          type="button"
          class={styles.toggle}
          aria-label={mobileSearchOpen() ? "Close search" : "Search saved links"}
          aria-expanded={mobileSearchOpen()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => mobileSearchOpen() ? setMobileSearchOpen(false) : openMobileSearch()}
        >
          {mobileSearchOpen() ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
        </button>
        <input
          data-mark-search
          ref={searchInput}
          type="search"
          value={searchQuery()}
          placeholder="search"
          aria-label="Search saved links"
          onInput={(event) => {
            const query = event.currentTarget.value;
            setSearchQuery(query);
            scheduleSearch(query);
          }}
          onBlur={() => {
            if (!searchQuery()) setMobileSearchOpen(false);
          }}
        />
      </div>
    </header>
  );
}
