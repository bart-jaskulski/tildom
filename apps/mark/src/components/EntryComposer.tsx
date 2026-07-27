import { Show, createEffect } from "solid-js";
import { handleMarkdownishEnter } from "@tildom/markdownish/keyboard";
import ClipboardPaste from "lucide-solid/icons/clipboard-paste";
import Button from "./Button";
import styles from "./EntryComposer.module.css";
import { handleTextareaKeyboardSubmit, resizeTextareaToFitContent } from "~/lib/textarea";

type EntryComposerProps = {
  id: string;
  value: string;
  error: string | null;
  isSaving: boolean;
  mobile?: boolean;
  onInput: (value: string) => void;
  onSubmit: (event: SubmitEvent) => void;
  onPasteLink: () => void;
  textareaRef: (element: HTMLTextAreaElement) => void;
};

export default function EntryComposer(props: EntryComposerProps) {
  let textarea: HTMLTextAreaElement | undefined;

  createEffect(() => {
    props.value;
    if (textarea) resizeTextareaToFitContent(textarea);
  });

  return (
    <form class={styles.form} classList={{ [styles.mobile]: props.mobile }} onSubmit={props.onSubmit}>
      <label class="visually-hidden" for={props.id}>save</label>
      <textarea
        id={props.id}
        ref={(element) => {
          textarea = element;
          props.textareaRef(element);
          resizeTextareaToFitContent(element);
        }}
        value={props.value}
        onInput={(event) => {
          props.onInput(event.currentTarget.value);
          resizeTextareaToFitContent(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (!handleMarkdownishEnter(event)) handleTextareaKeyboardSubmit(event);
        }}
        rows={5}
        placeholder="Paste a link or write a note"
        class={styles.textarea}
      />

      <Show when={props.error}>
        <p class={styles.error}>{props.error}</p>
      </Show>

      <div class={styles.actions}>
        <Button type="submit" disabled={!props.value.trim() || props.isSaving}>
          {props.isSaving ? "saving..." : "save"}
        </Button>
        <Button
          type="button"
          class={styles.paste}
          disabled={props.isSaving}
          onClick={props.onPasteLink}
          aria-label="Save copied link"
          title="Save copied link"
        >
          <ClipboardPaste aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
