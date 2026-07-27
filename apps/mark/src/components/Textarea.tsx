import { handleMarkdownishEnter } from "@tildom/markdownish/keyboard";
import type { JSX } from "solid-js";
import { createEffect, splitProps } from "solid-js";
import { handleTextareaKeyboardSubmit, resizeTextareaToFitContent } from "~/lib/textarea";
import styles from "./Textarea.module.css";

type TextareaProps = Omit<
  JSX.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "onInput" | "onKeyDown" | "ref"
> & {
  ref?: (element: HTMLTextAreaElement) => void;
  onInput?: JSX.EventHandler<HTMLTextAreaElement, InputEvent>;
  onKeyDown?: JSX.EventHandler<HTMLTextAreaElement, KeyboardEvent>;
};

export default function Textarea(props: TextareaProps) {
  const [local, textareaProps] = splitProps(props, ["class", "ref", "onInput", "onKeyDown", "value"]);
  let textarea: HTMLTextAreaElement | undefined;

  createEffect(() => {
    local.value;
    if (textarea) resizeTextareaToFitContent(textarea);
  });

  return (
    <textarea
      {...textareaProps}
      ref={(element) => {
        textarea = element;
        local.ref?.(element);
        resizeTextareaToFitContent(element);
      }}
      class={`${styles.textarea} ${local.class ?? ""}`}
      value={local.value}
      onInput={(event) => {
        resizeTextareaToFitContent(event.currentTarget);
        local.onInput?.(event);
      }}
      onKeyDown={(event) => {
        if (!handleMarkdownishEnter(event)) handleTextareaKeyboardSubmit(event);
        local.onKeyDown?.(event);
      }}
    />
  );
}
