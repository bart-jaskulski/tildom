import { For, JSX, splitProps } from "solid-js";
import styles from "./LoadingSkeleton.module.css";

export interface LoadingSkeletonProps extends JSX.HTMLAttributes<HTMLDivElement> {
  variant?: "list" | "detail" | "lines";
  lines?: number;
}

export default function LoadingSkeleton(props: LoadingSkeletonProps) {
  const [local, others] = splitProps(props, ["variant", "lines", "class"]);

  const lineCount = () => local.lines ?? (local.variant === "detail" ? 4 : 3);

  return (
    <div
      class={`${styles.container} ${local.class ?? ""}`.trim()}
      role="status"
      aria-live="polite"
      {...others}
    >
      <span class="visually-hidden">Loading...</span>
      <For each={Array.from({ length: lineCount() })}>
        {(_, index) => (
          <span
            class={`${styles.pulseLine} ${index() === 0 ? styles.firstLine : ""}`}
            aria-hidden="true"
          />
        )}
      </For>
    </div>
  );
}
