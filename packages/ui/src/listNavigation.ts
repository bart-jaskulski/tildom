import { createMemo, createSignal, type Accessor } from "solid-js";

export type ListNavigationOptions<T> = {
  items: Accessor<T[]>;
  onSelect?: (item: T, index: number) => void;
  scrollBlock?: ScrollLogicalPosition;
  scrollBehavior?: ScrollBehavior;
  containerRef?: Accessor<HTMLElement | undefined>;
};

export type ListNavigationResult<T> = {
  activeIndex: Accessor<number | null>;
  activeItem: Accessor<T | null>;
  moveNext: () => void;
  movePrev: () => void;
  select: (index: number) => void;
  reset: () => void;
};

/**
 * Manages keyboard list navigation (Vim j/k, index clamping, scroll into view).
 */
export function createListNavigation<T>(options: ListNavigationOptions<T>): ListNavigationResult<T> {
  const [activeIndex, setActiveIndex] = createSignal<number | null>(null);

  const activeItem = createMemo(() => {
    const idx = activeIndex();
    const list = options.items();
    return idx !== null && idx >= 0 && idx < list.length ? list[idx] : null;
  });

  const scrollToActive = (idx: number) => {
    const container = options.containerRef?.();
    if (container) {
      const child = container.children[idx];
      if (child instanceof HTMLElement) {
        child.scrollIntoView({
          block: options.scrollBlock ?? "nearest",
          behavior: options.scrollBehavior ?? "smooth",
        });
        return;
      }
    }
    const rowEl = document.querySelector(`[data-index="${idx}"]`);
    if (rowEl instanceof HTMLElement) {
      rowEl.scrollIntoView({
        block: options.scrollBlock ?? "nearest",
        behavior: options.scrollBehavior ?? "smooth",
      });
    }
  };

  const move = (direction: 1 | -1) => {
    const list = options.items();
    if (list.length === 0) return;
    const current = activeIndex() ?? (direction === 1 ? -1 : list.length);
    const next = Math.min(Math.max(current + direction, 0), list.length - 1);
    setActiveIndex(next);
    scrollToActive(next);
    const item = list[next];
    if (item && options.onSelect) {
      options.onSelect(item, next);
    }
  };

  const select = (index: number) => {
    const list = options.items();
    if (index >= 0 && index < list.length) {
      setActiveIndex(index);
      scrollToActive(index);
      if (options.onSelect) {
        options.onSelect(list[index], index);
      }
    }
  };

  const reset = () => setActiveIndex(null);

  return {
    activeIndex,
    activeItem,
    moveNext: () => move(1),
    movePrev: () => move(-1),
    select,
    reset,
  };
}
