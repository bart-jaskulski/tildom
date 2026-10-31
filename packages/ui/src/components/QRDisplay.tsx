import QRCode from "qrcode";
import { Show, createEffect, createSignal, splitProps, JSX } from "solid-js";
import styles from "./QRDisplay.module.css";

export interface QRDisplayProps extends JSX.HTMLAttributes<HTMLDivElement> {
  value: string;
  size?: number;
}

export default function QRDisplay(props: QRDisplayProps) {
  const [local, others] = splitProps(props, ["value", "size", "class"]);
  const [dataUrl, setDataUrl] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    const val = local.value;
    if (!val) {
      setDataUrl("");
      return;
    }
    setError(null);
    void QRCode.toDataURL(val, {
      width: local.size ?? 220,
      margin: 1,
      color: {
        dark: "#24292e",
        light: "#ffffff",
      },
    })
      .then(setDataUrl)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to generate QR code"));
  });

  return (
    <div class={`${styles.root} ${local.class ?? ""}`.trim()} {...others}>
      <Show when={error()}>
        <span class={styles.error} role="alert">{error()}</span>
      </Show>
      <Show when={!error() && dataUrl()}>
        <img class={styles.image} src={dataUrl()} alt="QR code" width={local.size ?? 220} height={local.size ?? 220} />
      </Show>
    </div>
  );
}
