import { JSX, splitProps } from "solid-js";
import styles from "./Input.module.css";

export interface SelectProps extends JSX.SelectHTMLAttributes<HTMLSelectElement> {}

export default function Select(props: SelectProps) {
  const [local, others] = splitProps(props, ["class"]);
  return <select class={`${styles.tuiInput} ${local.class ?? ""}`} {...others} />;
}
