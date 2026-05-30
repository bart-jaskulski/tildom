import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import AppNav from "~/components/AppNav";

export default function NotFound() {
  return (
    <main class="hn-page">
      <Title>Not Found | mark.tildom</Title>
      <AppNav />
      <section class="hn-content">
        <div class="hn-panel hn-stack">
          <h1 class="hn-heading">Page not found</h1>
          <p class="hn-muted">That local route does not exist.</p>
          <A href="/" class="hn-button">
            back to new
          </A>
        </div>
      </section>
    </main>
  );
}
