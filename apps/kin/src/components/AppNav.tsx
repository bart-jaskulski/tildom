import { A, useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { createEffect, createSignal, onCleanup } from "solid-js";

type AppNavProps = {
  active?: "settings" | "people";
};

const SEARCH_DEBOUNCE_MS = 200;

export default function AppNav(props: AppNavProps) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [searchQuery, setSearchQuery] = createSignal(String(params.q ?? ""));
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  // Reactively track changes to the URL parameter (e.g. cleared externally)
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
      
      // If we are already on the directory home, update URL search params in-place
      if (location.pathname === "/") {
        setParams({ q: query || undefined }, { replace: true });
        return;
      }

      // If we are on details/settings, navigate back to home with the query parameter
      navigate(query ? `/?q=${encodeURIComponent(query)}` : "/");
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleClear = () => {
    setSearchQuery("");
    if (location.pathname === "/") {
      setParams({ q: undefined }, { replace: true });
    } else {
      navigate("/");
    }
  };

  return (
    <header class="tui-tabline">
      <div class="tui-brand">
        <A href="/" class="tui-brand-logo" style="color: inherit; text-decoration: none;">K</A>
        <A href="/" style="color: inherit; text-decoration: none; font-weight: bold;">kin.db</A>
      </div>

      <nav class="tui-nav" aria-label="Primary">
        <A
          href="/"
          class="tui-nav-item"
          classList={{ "active-tab": props.active === "people" || location.pathname.startsWith("/person") }}
        >
          [ people.db ]
        </A>
        <A
          href="/settings"
          class="tui-nav-item"
          classList={{ "active-tab": props.active === "settings" }}
        >
          [ settings.conf ]
        </A>
      </nav>

      <div class="tui-search" role="search">
        <input
          id="search-input"
          type="search"
          value={searchQuery()}
          placeholder="search"
          aria-label="Search contacts"
          onInput={(e) => {
            const val = e.currentTarget.value;
            setSearchQuery(val);
            scheduleSearch(val);
          }}
        />
        {searchQuery() && (
          <button
            style="padding: 0 4px; cursor: pointer; color: var(--syntax-error); font-weight: bold; border: none; background: transparent; font-family: inherit;"
            onClick={handleClear}
            aria-label="Clear search"
          >
            [X]
          </button>
        )}
      </div>
    </header>
  );
}
