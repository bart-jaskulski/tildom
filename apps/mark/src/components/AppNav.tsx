import { A, useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { createEffect, createSignal, onCleanup } from "solid-js";

type AppNavProps = {
  active?: "settings";
};

const SEARCH_DEBOUNCE_MS = 250;

export default function AppNav(props: AppNavProps) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = createSignal(String(params.q ?? ""));
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

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

  return (
    <header class="hn-topbar">
      <div class="hn-brand">
        <A href="/" class="hn-logo">m</A>
        <A href="/" class="hn-title">mark.tildom</A>
      </div>

      <nav class="hn-nav" aria-label="Primary">
        <A href="/" aria-current={props.active !== "settings" ? "page" : undefined}>bookmarks.db</A>
        <A href="/settings" aria-current={props.active === "settings" ? "page" : undefined}>settings.json</A>
      </nav>

      <div class="hn-search" role="search">
        <input
          type="search"
          value={searchQuery()}
          placeholder="search"
          aria-label="Search saved links"
          onInput={(event) => {
            const query = event.currentTarget.value;
            setSearchQuery(query);
            scheduleSearch(query);
          }}
        />
      </div>
    </header>
  );
}
