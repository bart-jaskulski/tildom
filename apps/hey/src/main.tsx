import { render } from "solid-js/web";
import { registerPwa } from "@tildom/ui";
import App from "./App";
import "./app.css";

registerPwa();

render(() => <App />, document.getElementById("app")!);
