import { render } from "solid-js/web";
import { registerPwa } from "@tildom/ui";
import App from "./app";
import { markStartup, measureStartup } from "~/lib/startupPerformance";

markStartup("main:ready");
measureStartup("boot-to-main", "boot:start", "main:ready");
registerPwa();

const appRoot = document.getElementById("app")!;
appRoot.replaceChildren();
render(() => <App />, appRoot);
markStartup("app:mounted");

requestAnimationFrame(() => {
  markStartup("app:painted");
  measureStartup("boot-to-app-painted", "boot:start", "app:painted");
});
