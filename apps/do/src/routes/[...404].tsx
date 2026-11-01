import { Title } from "@solidjs/meta";
import { Button } from "@tildom/ui";
import AppNav from "~/components/AppNav";

export default function NotFound() {
  return (
    <div class="do-page">
      <Title>404 · do.tildom</Title>

      <AppNav active="tasks" />

      {/* 404 Content */}
      <main class="tui-container not-found-container">
        <div class="not-found-card">
          <p class="not-found-label">[ 404 NOT FOUND ]</p>
          <h1 class="not-found-title">
            This buffer does not exist.
          </h1>
          <p class="not-found-desc">
            THE SPECIFIED CONFIGURATION FILE OR VIEW OR ENDPOINT IS NOT REGISTERED ON THIS TERMINAL.
          </p>

          <div>
            <Button href="/" bracket>
              RETURN TO MAIN BUFFER
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
