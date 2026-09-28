import { For, JSX, children, createMemo, splitProps } from "solid-js";
import { useSearchContext } from "./SearchContext";
import styles from "./SearchHighlight.module.css";

const searchTerms = (query: string): string[] =>
  query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];

export interface SearchHighlightProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children?: JSX.Element;
  class?: string;
}

export default function SearchHighlight(props: SearchHighlightProps) {
  const ctx = useSearchContext();
  const [local, others] = splitProps(props, ["children", "class"]);
  const resolved = children(() => local.children);

  const text = createMemo(() => {
    const c = resolved();
    if (c === null || c === undefined) return "";
    return String(c);
  });

  const terms = () => {
    const q = ctx.query()?.trim();
    if (!q) return [];
    return searchTerms(q).sort((a, b) => b.length - a.length);
  };

  const parts = () => {
    const t = terms();
    const str = text();
    if (!t.length || !str) return [str];
    const pattern = t.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    return str.split(new RegExp(`(${pattern})`, "gi"));
  };

  return (
    <span class={local.class} {...others}>
      <For each={parts()}>
        {(part) => {
          const isMatch = () => terms().includes(part.toLowerCase());
          return isMatch() ? <mark class={styles.highlight}>{part}</mark> : part;
        }}
      </For>
    </span>
  );
}
