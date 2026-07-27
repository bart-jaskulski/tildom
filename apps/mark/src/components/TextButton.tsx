import type { JSX } from "solid-js";
import styles from "./TextButton.module.css";

type TextButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  inline?: boolean;
};

export default function TextButton({ inline, class: className, ...props }: TextButtonProps) {
  return <button {...props} class={`${styles.button} ${inline ? styles.inline : ""} ${className ?? ""}`} />;
}
