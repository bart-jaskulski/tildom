import { JSX, splitProps } from "solid-js";
import styles from "./Button.module.css";

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "danger" | "text";
}

export default function Button(props: ButtonProps) {
  const [local, others] = splitProps(props, ["variant", "class", "children"]);

  const buttonClass = () => {
    const base = styles.btn;
    const variantClass = local.variant === "danger" ? styles.danger : local.variant === "text" ? styles.text : "";
    return `${base} ${variantClass} ${local.class ?? ""}`.trim();
  };

  return (
    <button class={buttonClass()} type="button" {...others}>
      [ {local.children} ]
    </button>
  );
}
