import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import buttonStyles from "~/components/Button.module.css";

export default function NotFound() {
  return (
    <>
      <Title>Not Found | mark.tildom</Title>
          <h1 class="hn-heading">Page not found</h1>
          <p class="hn-muted">That local route does not exist.</p>
          <A href="/" class={buttonStyles.button}>
            back to new
          </A>
    </>
  );
}
