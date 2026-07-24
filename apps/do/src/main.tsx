import { render } from "solid-js/web";
import { registerPwa } from "@tildom/ui";
import App from "./app";

registerPwa();

render(() => <App />, document.getElementById("app")!);
