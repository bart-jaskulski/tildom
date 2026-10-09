import { handleMarkdownishEnter } from "@tildom/markdownish/keyboard";
import { Textarea as UiTextarea } from "@tildom/ui";
import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { handleTextareaKeyboardSubmit } from "~/lib/textarea";

type TextareaProps = Omit<
  JSX.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "onKeyDown"
> & {
  onKeyDown?: JSX.EventHandler<HTMLTextAreaElement, KeyboardEvent>;
};

export default function Textarea(props: TextareaProps) {
  const [local, textareaProps] = splitProps(props, ["onKeyDown"]);
  return (
    <UiTextarea
      {...textareaProps}
      autoResize
      onKeyDown={(event) => {
        if (!handleMarkdownishEnter(event)) handleTextareaKeyboardSubmit(event);
        local.onKeyDown?.(event);
      }}
    />
  );
}
