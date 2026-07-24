import { render } from "solid-js/web";
import { registerPwa } from "@tildom/ui";
import App from "./app";

registerPwa();

const appRoot = document.getElementById("app")!;
appRoot.replaceChildren();
render(() => <App />, appRoot);
