import { JSX, Show, createEffect, onCleanup, onMount } from "solid-js";
import styles from "./Dialog.module.css";

export interface DialogProps {
  open?: boolean;
  onClose?: () => void;
  title?: string | JSX.Element;
  children?: JSX.Element;
  class?: string;
  ref?: (element: HTMLDialogElement) => void;
  ariaLabel?: string;
  hideCloseButton?: boolean;
}

export default function Dialog(props: DialogProps) {
  let dialogRef: HTMLDialogElement | undefined;

  const handleClose = () => {
    if (dialogRef?.open) {
      dialogRef.close();
    } else {
      props.onClose?.();
    }
  };

  createEffect(() => {
    if (!dialogRef) return;
    if (props.open) {
      if (!dialogRef.open) {
        try {
          dialogRef.showModal();
        } catch {
          // Fallback if already showing or modal state conflict
          dialogRef.open = true;
        }
      }
    } else {
      if (dialogRef.open) {
        dialogRef.close();
      }
    }
  });

  onMount(() => {
    if (dialogRef) {
      props.ref?.(dialogRef);
    }
  });

  onCleanup(() => {
    if (dialogRef?.open) {
      dialogRef.close();
    }
  });

  return (
    <dialog
      ref={(element) => {
        dialogRef = element;
        props.ref?.(element);
      }}
      class={`${styles.dialog} ${props.class ?? ""}`.trim()}
      aria-label={typeof props.title === "string" ? props.title : props.ariaLabel}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
      onClose={() => {
        props.onClose?.();
      }}
    >
      <Show when={props.title || !props.hideCloseButton}>
        <header class={styles.header}>
          <Show when={props.title}>
            <h2 class={styles.title}>{props.title}</h2>
          </Show>
          <Show when={!props.hideCloseButton}>
            <button
              type="button"
              class={styles.closeButton}
              onClick={handleClose}
              aria-label="Close dialog"
            >
              [ × ]
            </button>
          </Show>
        </header>
      </Show>
      <div class={styles.body}>{props.children}</div>
    </dialog>
  );
}
