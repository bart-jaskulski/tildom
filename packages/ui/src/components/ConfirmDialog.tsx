import { JSX, Show } from "solid-js";
import Button from "./Button";
import Dialog from "./Dialog";
import styles from "./ConfirmDialog.module.css";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string | JSX.Element;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  isBusy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  class?: string;
}

export default function ConfirmDialog(props: ConfirmDialogProps) {
  const confirmLabel = () => props.confirmText ?? (props.danger ? "delete" : "confirm");
  const cancelLabel = () => props.cancelText ?? "cancel";

  return (
    <Dialog
      open={props.open}
      onClose={props.onCancel}
      title={props.title}
      class={props.class}
    >
      <div class={styles.container}>
        <Show when={props.message}>
          <div class={styles.message}>
            {typeof props.message === "string" ? <p>{props.message}</p> : props.message}
          </div>
        </Show>

        <div class={styles.actions}>
          <Button
            variant="text"
            onClick={props.onCancel}
            disabled={props.isBusy}
          >
            [ {cancelLabel()} ]
          </Button>
          <Button
            danger={props.danger}
            onClick={() => void props.onConfirm()}
            disabled={props.isBusy}
          >
            {props.isBusy ? "[ processing... ]" : `[ ${confirmLabel()} ]`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
