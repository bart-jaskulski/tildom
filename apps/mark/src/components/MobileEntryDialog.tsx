import { createEffect, onCleanup } from "solid-js";
import type { EditorHandle } from "@tildom/ui";
import EntryComposer from "./EntryComposer";
import styles from "./MobileEntryDialog.module.css";

type MobileEntryDialogProps = {
  value: string;
  error: string | null;
  isSaving: boolean;
  onInput: (value: string) => void;
  onSubmit: (event: SubmitEvent) => void;
  onPasteLink: () => void;
  dialogRef: (element: HTMLDialogElement) => void;
  textareaRef: (element: EditorHandle) => void;
};

export default function MobileEntryDialog(props: MobileEntryDialogProps) {
  let dialog: HTMLDialogElement | undefined;

  createEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const onResize = () => {
      if (dialog?.open && dialog.contains(document.activeElement)) {
        dialog.scrollIntoView({ block: "end", behavior: "smooth" });
      }
    };
    vv.addEventListener("resize", onResize);
    onCleanup(() => vv.removeEventListener("resize", onResize));
  });

  return (
    <dialog
      ref={(element) => {
        dialog = element;
        props.dialogRef(element);
      }}
      class={styles.dialog}
      aria-label="Add link"
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog?.close();
      }}
      onFocusIn={(e) => {
        e.currentTarget.scrollIntoView({ block: "end", behavior: "smooth" });
      }}
    >
      <div class={styles.actions}>
        <button type="button" class={styles.close} onClick={() => dialog?.close()}>
          [ close ]
        </button>
      </div>
      <EntryComposer
        id="mobile-entry-body"
        value={props.value}
        error={props.error}
        isSaving={props.isSaving}
        mobile
        onInput={props.onInput}
        onSubmit={props.onSubmit}
        onPasteLink={props.onPasteLink}
        textareaRef={props.textareaRef}
      />
    </dialog>
  );
}
