import QRCode from "qrcode";
import { Show, createEffect, createSignal } from "solid-js";

type QRDisplayProps = {
  value: string;
};

export default function QRDisplay(props: QRDisplayProps) {
  const [dataUrl, setDataUrl] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    setDataUrl("");
    setError(null);

    void QRCode.toDataURL(props.value, {
      width: 280,
      margin: 2,
      color: {
        dark: "#24292e",
        light: "#ffffff",
      },
    })
      .then(setDataUrl)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to generate QR code"));
  });

  return (
    <>
      <Show when={error()}>
        <p class="hn-error" role="alert">{error()}</p>
      </Show>
      <Show when={!error() && dataUrl()}>
        <img class="qr-image" src={dataUrl()} alt="Pairing QR code" />
      </Show>
    </>
  );
}
