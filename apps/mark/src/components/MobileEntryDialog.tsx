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
  textareaRef: (element: HTMLTextAreaElement) => void;
};

export default function MobileEntryDialog(props: MobileEntryDialogProps) {
  let dialog: HTMLDialogElement | undefined;

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
