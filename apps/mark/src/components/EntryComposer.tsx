import { Show } from "solid-js";
import ClipboardPaste from "lucide-solid/icons/clipboard-paste";
import { Button, Editor, type EditorHandle } from "@tildom/ui";
import styles from "./EntryComposer.module.css";

type EntryComposerProps = {
  id: string;
  value: string;
  error: string | null;
  isSaving: boolean;
  mobile?: boolean;
  onInput: (value: string) => void;
  onSubmit: (event: SubmitEvent) => void;
  onPasteLink: () => void;
  textareaRef?: (element: EditorHandle) => void;
};

export default function EntryComposer(props: EntryComposerProps) {
  return (
    <form class={styles.form} classList={{ [styles.mobile]: props.mobile }} onSubmit={props.onSubmit}>
      <label class="visually-hidden" for={props.id}>save</label>
      <Editor
        id={props.id}
        ref={props.textareaRef}
        value={props.value}
        onInput={props.onInput}
        onSubmit={() => props.onSubmit(new Event("submit") as SubmitEvent)}
        placeholder="Paste a link or write a note"
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
