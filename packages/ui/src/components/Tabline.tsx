import { For, JSX, Show } from "solid-js";
import { AppIcon, type AppIconName } from "../AppIcon";
import styles from "./Tabline.module.css";

export interface TabItem {
  label: string;
  href: string;
  active?: boolean;
}

export interface TablineProps {
  appName?: string;
  title?: string;
  homeHref?: string;
  tabs?: TabItem[];
  children?: JSX.Element;
  class?: string;
}

export interface TablineBrandProps {
  app?: AppIconName | string;
  title?: string;
  href?: string;
  class?: string;
  onClick?: (event: MouseEvent) => void;
}

export function TablineBrand(props: TablineBrandProps) {
  const isKnownApp = () =>
    ["home", "mark", "do", "kin", "hey", "list", "post", "loop"].includes(props.app ?? "");

  const content = (
    <>
      <Show when={props.app && isKnownApp()}>
        <AppIcon app={props.app as AppIconName} class={styles.logo} />
      </Show>
      <span>{props.title ?? "tildom"}</span>
    </>
  );

  return (
    <div class={`${styles.brand} ${props.class ?? ""}`}>
      <Show
        when={props.href || !props.onClick}
        fallback={
          <button
            type="button"
            class={styles.title}
            aria-label={`${props.app ?? props.title ?? "tildom"} home`}
            onClick={props.onClick}
          >
            {content}
          </button>
        }
      >
        <a
          href={props.href ?? "/"}
          class={styles.title}
          aria-label={`${props.app ?? props.title ?? "tildom"} home`}
          onClick={props.onClick}
        >
          {content}
        </a>
      </Show>
    </div>
  );
}

export interface TablineNavProps {
  children?: JSX.Element;
  "aria-label"?: string;
  class?: string;
}

export function TablineNav(props: TablineNavProps) {
  return (
    <nav class={`${styles.nav} ${props.class ?? ""}`} aria-label={props["aria-label"] ?? "Primary"}>
      {props.children}
    </nav>
  );
}

export interface TablineTabProps {
  href?: string;
  active?: boolean;
  children: JSX.Element;
  class?: string;
  onClick?: (event: MouseEvent) => void;
}

export function TablineTab(props: TablineTabProps) {
  if (props.href) {
    return (
      <a
        href={props.href}
        aria-current={props.active ? "page" : undefined}
        class={props.class}
        onClick={props.onClick}
      >
        [ {props.children} ]
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-current={props.active ? "page" : undefined}
      class={props.class}
      onClick={props.onClick}
    >
      [ {props.children} ]
    </button>
  );
}

export function TablineRoot(props: TablineProps) {
  if (props.children) {
    return <header class={`${styles.tabline} ${props.class ?? ""}`}>{props.children}</header>;
  }

  // Backward compatibility fallback for prop-based Tabline
  return (
    <header class={`${styles.tabline} ${props.class ?? ""}`}>
      <TablineBrand app={props.appName} title={props.title} href={props.homeHref} />
      <TablineNav>
        <For each={props.tabs}>
          {(tab) => (
            <TablineTab href={tab.href} active={tab.active}>
              {tab.label}
            </TablineTab>
          )}
        </For>
      </TablineNav>
    </header>
  );
}

export const Tabline = Object.assign(TablineRoot, {
  Brand: TablineBrand,
  Nav: TablineNav,
  Tab: TablineTab,
});

export default Tabline;
