import { createEffect, createSignal, onCleanup } from "solid-js";
import { useSearchContext } from "./SearchContext";
import styles from "./SearchInput.module.css";

export interface SearchInputProps {
  placeholder?: string;
  label?: string;
  debounceMs?: number;
  dataAttribute?: string;
  ref?: (el: HTMLInputElement) => void;
  class?: string;
}

const DEFAULT_DEBOUNCE_MS = 350;

export default function SearchInput(props: SearchInputProps) {
  const ctx = useSearchContext();
  const [localQuery, setLocalQuery] = createSignal(ctx.query());
  const [mobileSearchOpen, setMobileSearchOpen] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inputEl: HTMLInputElement | undefined;

  createEffect(() => {
    setLocalQuery(ctx.query());
  });

  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  const scheduleSearch = (raw: string) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      ctx.onSearch(raw.trim());
    }, props.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  };

  const toggleMobileSearch = () => {
    const next = !mobileSearchOpen();
    setMobileSearchOpen(next);
    if (next) queueMicrotask(() => inputEl?.focus());
  };

  return (
    <div
      class={`${styles.search} ${props.class ?? ""}`}
      data-open={mobileSearchOpen() || undefined}
      role="search"
    >
      <button
        type="button"
        class={styles.toggle}
        aria-label={mobileSearchOpen() ? "Close search" : (props.label ?? "Search")}
        aria-expanded={mobileSearchOpen()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggleMobileSearch}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d={
              mobileSearchOpen()
                ? "M6 6l12 12M18 6 6 18"
                : "m21 21-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
            }
          />
        </svg>
      </button>
      <input
        ref={(el) => {
          inputEl = el;
          props.ref?.(el);
        }}
        type="search"
        role="searchbox"
        value={localQuery()}
        placeholder={props.placeholder ?? "search"}
        aria-label={props.label ?? "Search"}
        onInput={(e) => {
          const val = e.currentTarget.value;
          setLocalQuery(val);
          scheduleSearch(val);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (timer) clearTimeout(timer);
            ctx.onSearch(localQuery().trim());
          }
        }}
        onBlur={() => {
          if (!localQuery()) setMobileSearchOpen(false);
        }}
        {...(props.dataAttribute ? { [props.dataAttribute]: true } : {})}
      />
    </div>
  );
}
