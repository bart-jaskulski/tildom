import { JSX, Show, splitProps } from "solid-js";
import styles from "./Settings.module.css";

export interface SettingsContainerProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children?: JSX.Element;
}

export function SettingsContainer(props: SettingsContainerProps) {
  const [local, others] = splitProps(props, ["children", "class"]);
  return (
    <div class={`${styles.container} ${local.class ?? ""}`.trim()} {...others}>
      {local.children}
    </div>
  );
}

export interface SettingsSectionProps extends JSX.HTMLAttributes<HTMLElement> {
  title?: string;
  children?: JSX.Element;
}

export function SettingsSection(props: SettingsSectionProps) {
  const [local, others] = splitProps(props, ["title", "children", "class"]);
  return (
    <section class={`${styles.section} ${local.class ?? ""}`.trim()} {...others}>
      <Show when={local.title}>
        <h2 class={styles.sectionTitle}>{local.title}</h2>
      </Show>
      <div class={styles.sectionBody}>
        {local.children}
      </div>
    </section>
  );
}

export interface SettingsRowProps extends JSX.HTMLAttributes<HTMLDivElement> {
  label: string | JSX.Element;
  hint?: string | JSX.Element;
  align?: "center" | "top";
  children?: JSX.Element;
}

export function SettingsRow(props: SettingsRowProps) {
  const [local, others] = splitProps(props, ["label", "hint", "align", "children", "class"]);
  const isTop = () => local.align === "top";

  return (
    <div
      class={`${styles.row} ${isTop() ? styles.rowAlignTop : styles.rowAlignCenter} ${local.class ?? ""}`.trim()}
      {...others}
    >
      <div class={styles.rowLabel}>
        <span class={styles.label}>{local.label}</span>
        <Show when={local.hint}>
          <span class={styles.hint}>{local.hint}</span>
        </Show>
      </div>
      <div class={styles.rowValue}>
        {local.children}
      </div>
    </div>
  );
}

export interface SettingsActionsProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children?: JSX.Element;
}

export function SettingsActions(props: SettingsActionsProps) {
  const [local, others] = splitProps(props, ["children", "class"]);
  return (
    <div class={`${styles.actions} ${local.class ?? ""}`.trim()} {...others}>
      {local.children}
    </div>
  );
}
