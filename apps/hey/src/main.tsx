import { render } from "solid-js/web";
import App from "./App";
import "./app.css";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .catch((error) => console.warn("SW registration failed:", error));
}

render(() => <App />, document.getElementById("app")!);
