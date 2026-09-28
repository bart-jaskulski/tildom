import { type JSX, Show, splitProps } from "solid-js";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  message: string;
  hint?: string;
  centered?: boolean;
  action?: JSX.Element;
  children?: JSX.Element;
  class?: string;
}

export default function EmptyState(props: EmptyStateProps) {
  const [local, rest] = splitProps(props, ["message", "hint", "centered", "action", "children", "class"]);

  return (
    <div
      role="status"
      class={`${styles.emptyState} ${local.centered ? styles.centered : ""} ${local.class ?? ""}`}
      {...rest}
    >
      <p class={styles.message}>{local.message}</p>
      <Show when={local.hint}>
        <p class={styles.hint}>{local.hint}</p>
      </Show>
      <Show when={local.action}>
        <div class={styles.actions}>{local.action}</div>
      </Show>
      <Show when={local.children}>
        <div class={styles.actions}>{local.children}</div>
      </Show>
    </div>
  );
}
