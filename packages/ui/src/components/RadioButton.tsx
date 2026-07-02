import { JSX, splitProps } from "solid-js";
import styles from "./RadioButton.module.css";

export interface RadioButtonProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  checked: boolean;
  onChange: () => void;
  label: string;
}

export default function RadioButton(props: RadioButtonProps) {
  const [local, others] = splitProps(props, ["checked", "onChange", "label"]);

  return (
    <label class={styles.container}>
      <input
        type="radio"
        class={styles.srOnly}
        checked={local.checked}
        onChange={() => local.onChange()}
        {...others}
      />
      <span class={styles.circle} aria-hidden="true">
        {local.checked ? "(*)" : "( )"}
      </span>
      <span class={styles.label}>{local.label}</span>
    </label>
  );
}
