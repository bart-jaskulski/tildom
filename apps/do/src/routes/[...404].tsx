import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";

export default function NotFound() {
  return (
    <div class="min-h-screen flex flex-col font-mono text-[var(--fg-default)] bg-[var(--bg-canvas)]">
      <Title>404 · do.tildom</Title>

      {/* TUI Topbar */}
      <header class="tui-topbar">
        <div class="tui-brand">
          <span class="tui-logo">~</span>
          <span class="tui-title">do.tildom</span>
        </div>
        <nav class="tui-nav">
          <A href="/" end>[ tasks.db ]</A>
          <A href="/settings">[ settings.json ]</A>
          <A href="/pair">[ pair.conf ]</A>
        </nav>
      </header>

      {/* 404 Content */}
      <main class="tui-container max-w-xl mx-auto flex-1 justify-center py-16">
        <div class="border-2 border-[var(--fg-default)] bg-[var(--bg-surface)] p-8 flex flex-col gap-4 font-mono">
          <p class="text-xs font-bold text-[var(--fg-muted)] uppercase tracking-[0.2em]">[ 404 NOT FOUND ]</p>
          <h1 class="text-xl font-bold uppercase tracking-tight text-[var(--fg-default)]">
            This buffer does not exist.
          </h1>
          <p class="text-sm text-[var(--fg-muted)]">
            THE SPECIFIED CONFIGURATION FILE OR VIEW OR ENDPOINT IS NOT REGISTERED ON THIS TERMINAL.
          </p>

          <div class="mt-4">
            <A
              href="/"
              class="tui-button"
            >
              [ RETURN TO MAIN BUFFER ]
            </A>
          </div>
        </div>
      </main>
    </div>
  );
}
