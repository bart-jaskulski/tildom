import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import styles from "./Button.module.css";

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean;
};

export default function Button(props: ButtonProps) {
  const [local, buttonProps] = splitProps(props, ["danger", "class"]);
  return <button {...buttonProps} class={`${styles.button} ${local.danger ? styles.danger : ""} ${local.class ?? ""}`} />;
}
