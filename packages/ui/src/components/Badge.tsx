import { type JSX, splitProps } from "solid-js";
import styles from "./Badge.module.css";

export type BadgeVariant = "bracket" | "tag" | "subtle" | "active" | "keyword";

export interface BadgeProps {
  variant?: BadgeVariant;
  children: JSX.Element;
  href?: string;
  onClick?: (event: MouseEvent) => void;
  class?: string;
  title?: string;
  target?: string;
  rel?: string;
}

export default function Badge(props: BadgeProps) {
  const [local, rest] = splitProps(props, ["variant", "children", "href", "onClick", "class"]);
  const variant = () => local.variant ?? "bracket";
  const isInteractive = () => Boolean(local.href || local.onClick);

  const formatContent = () => {
    const v = variant();
    if (v === "bracket") {
      return <>[ {local.children} ]</>;
    }
    if (v === "tag") {
      return <>#{local.children}</>;
    }
    return local.children;
  };

  const classList = () => {
    const classes = [styles.badge, styles[variant()]];
    if (isInteractive()) classes.push(styles.interactive);
    if (local.class) classes.push(local.class);
    return classes.join(" ");
  };

  if (local.href) {
    return (
      <a href={local.href} class={classList()} {...rest}>
        {formatContent()}
      </a>
    );
  }

  if (local.onClick) {
    return (
      <button type="button" onClick={local.onClick} class={classList()} {...rest}>
        {formatContent()}
      </button>
    );
  }

  return (
    <span class={classList()} {...rest}>
      {formatContent()}
    </span>
  );
}
