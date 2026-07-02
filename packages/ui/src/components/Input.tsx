import { JSX, splitProps } from "solid-js";
import styles from "./Input.module.css";

export interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {}

export default function Input(props: InputProps) {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <input
      type="text"
      class={`${styles.tuiInput} ${local.class ?? ""}`}
      {...others}
    />
  );
}
