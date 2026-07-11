import { render } from "solid-js/web";
import App from "./app";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .catch((error) => console.warn("SW registration failed:", error));
}

const appRoot = document.getElementById("app")!;
appRoot.replaceChildren();
render(() => <App />, appRoot);
