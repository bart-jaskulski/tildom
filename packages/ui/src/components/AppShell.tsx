import { type JSX, Show } from "solid-js";
import { type AppIconName } from "../AppIcon";
import Tabline, { type TabItem } from "./Tabline";
import styles from "./AppShell.module.css";

export type AppShellProps = {
  appName: string;
  appTitle?: string;
  appIcon?: AppIconName;
  homeHref?: string;
  tabs?: TabItem[];
  actions?: JSX.Element;
  children: JSX.Element;
  class?: string;
};

export default function AppShell(props: AppShellProps) {
  return (
    <div class={`${styles.shell} ${props.class ?? ""}`}>
      <header class={styles.header}>
        <div class={styles.headerInner}>
          <Tabline
            appName={props.appName}
            title={props.appTitle}
            homeHref={props.homeHref}
            tabs={props.tabs}
          />
          <Show when={props.actions}>
            <div class={styles.actions}>{props.actions}</div>
          </Show>
        </div>
      </header>

      <main class={styles.main}>{props.children}</main>
    </div>
  );
}
