import { JSX, splitProps } from "solid-js";
import styles from "./Textarea.module.css";

export interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export default function Textarea(props: TextareaProps) {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <textarea
      class={`${styles.tuiTextarea} ${local.class ?? ""}`}
      {...others}
    />
  );
}
