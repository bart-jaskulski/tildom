import { A, useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { createEffect, createSignal, onCleanup } from "solid-js";
import styles from "./AppNav.module.css";

type AppNavProps = {
  active?: "settings" | "people";
};

const SEARCH_DEBOUNCE_MS = 350;

export default function AppNav(props: AppNavProps) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = createSignal(String(params.q ?? ""));
  const [mobileSearchOpen, setMobileSearchOpen] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let searchInput: HTMLInputElement | undefined;

  createEffect(() => setQuery(String(params.q ?? "")));
  onCleanup(() => timer && clearTimeout(timer));

  const scheduleSearch = (rawQuery: string) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const nextQuery = rawQuery.trim();
      if (location.pathname === "/") {
        setParams({ q: nextQuery || undefined }, { replace: true });
      } else {
        navigate(nextQuery ? `/?q=${encodeURIComponent(nextQuery)}` : "/");
      }
    }, SEARCH_DEBOUNCE_MS);
  };

  const toggleMobileSearch = () => {
    const open = !mobileSearchOpen();
    setMobileSearchOpen(open);
    if (open) queueMicrotask(() => searchInput?.focus());
  };

  return (
    <header class={styles.topbar}>
      <A href="/" class={styles.title}>
        <img class={styles.logo} src="/icon.svg" alt="" />
        <span>tildom</span>
      </A>

      <nav class={styles.nav} aria-label="Primary">
        <A href="/" aria-current={props.active === "people" ? "page" : undefined}>[ people.db ]</A>
        <A href="/settings" aria-current={props.active === "settings" ? "page" : undefined}>[ settings.json ]</A>
      </nav>

      <div class={styles.search} data-open={mobileSearchOpen() || undefined} role="search">
        <button
          type="button"
          class={styles.toggle}
          aria-label={mobileSearchOpen() ? "Close search" : "Search people"}
          aria-expanded={mobileSearchOpen()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleMobileSearch}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={mobileSearchOpen() ? "M6 6l12 12M18 6 6 18" : "m21 21-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"} />
          </svg>
        </button>
        <input
          id="search-input"
          data-kin-search
          ref={searchInput}
          type="search"
          value={query()}
          placeholder="search people and notes"
          aria-label="Search people and notes"
          onInput={(event) => {
            const nextQuery = event.currentTarget.value;
            setQuery(nextQuery);
            scheduleSearch(nextQuery);
          }}
          onBlur={() => {
            if (!query()) setMobileSearchOpen(false);
          }}
        />
      </div>
    </header>
  );
}
