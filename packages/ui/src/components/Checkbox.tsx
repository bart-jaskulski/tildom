import { JSX, splitProps } from "solid-js";
import styles from "./Checkbox.module.css";

export interface CheckboxProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export default function Checkbox(props: CheckboxProps) {
  const [local, others] = splitProps(props, ["checked", "onChange", "label"]);

  return (
    <label class={styles.container}>
      <input
        type="checkbox"
        class={styles.srOnly}
        checked={local.checked}
        onChange={(e) => local.onChange(e.currentTarget.checked)}
        {...others}
      />
      <span class={styles.box} aria-hidden="true">
        {local.checked ? "[x]" : "[ ]"}
      </span>
      {local.label && <span class={styles.label}>{local.label}</span>}
    </label>
  );
}
