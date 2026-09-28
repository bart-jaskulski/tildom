import { JSX, createEffect, splitProps } from "solid-js";
import styles from "./Textarea.module.css";

export interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize?: boolean;
}

export default function Textarea(props: TextareaProps) {
  const [local, others] = splitProps(props, ["class", "autoResize", "ref", "onInput", "value"]);
  let textareaRef: HTMLTextAreaElement | undefined;

  const resize = (el?: HTMLTextAreaElement) => {
    if (!el || !local.autoResize) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  createEffect(() => {
    local.value;
    if (textareaRef) resize(textareaRef);
  });

  return (
    <textarea
      ref={(el) => {
        textareaRef = el;
        if (typeof local.ref === "function") local.ref(el);
        resize(el);
      }}
      class={`${styles.tuiTextarea} ${local.class ?? ""}`}
      value={local.value}
      onInput={(e) => {
        resize(e.currentTarget);
        if (typeof local.onInput === "function") {
          (local.onInput as (event: InputEvent & { currentTarget: HTMLTextAreaElement; target: Element }) => void)(e);
        }
      }}
      {...others}
    />
  );
}
