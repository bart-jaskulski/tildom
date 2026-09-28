import { JSX, Show, splitProps } from "solid-js";
import styles from "./Button.module.css";

export type ButtonVariant = "default" | "danger" | "text";

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  danger?: boolean;
  bracket?: boolean;
  inline?: boolean;
  href?: string;
  as?: "button" | "a" | "label";
}

export default function Button(props: ButtonProps) {
  const [local, others] = splitProps(props, [
    "variant",
    "danger",
    "bracket",
    "inline",
    "class",
    "children",
    "type",
    "href",
    "as",
  ]);

  const isDanger = () => local.danger || local.variant === "danger";
  const isText = () => local.variant === "text" || local.inline;

  const buttonClass = () => {
    const base = isText() ? styles.text : styles.btn;
    const dangerClass = isDanger() ? styles.danger : "";
    const inlineClass = local.inline ? styles.inline : "";
    return `${base} ${dangerClass} ${inlineClass} ${local.class ?? ""}`.trim();
  };

  if (local.as === "label") {
    return (
      <label class={buttonClass()} {...(others as JSX.LabelHTMLAttributes<HTMLLabelElement>)}>
        <Show when={local.bracket} fallback={local.children}>
          [ {local.children} ]
        </Show>
      </label>
    );
  }

  if (local.as === "a" || local.href) {
    return (
      <a href={local.href} class={buttonClass()} {...(others as JSX.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        <Show when={local.bracket} fallback={local.children}>
          [ {local.children} ]
        </Show>
      </a>
    );
  }

  return (
    <button class={buttonClass()} type={local.type ?? "button"} {...others}>
      <Show when={local.bracket} fallback={local.children}>
        [ {local.children} ]
      </Show>
    </button>
  );
}
