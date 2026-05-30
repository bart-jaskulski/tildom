import { Link, Meta, MetaProvider, Title } from "@solidjs/meta";
import { Route, Router } from "@solidjs/router";
import { Show, Suspense, onMount } from "solid-js";
import { isOnline } from "~/stores/networkStore";
import { initializeVaultStore } from "~/stores/vaultStore";
import { initializeTaskStore } from "~/stores/taskStore";
import { initializeSync } from "~/lib/sync";
import Home from "~/routes/index";
import SettingsPage from "~/routes/settings";
import PairPage from "~/routes/pair";
import NotFound from "~/routes/[...404]";
import "./app.css";

export default function App() {
  onMount(async () => {
    await initializeVaultStore();
    await initializeTaskStore();

    if (typeof window !== "undefined") {
      void initializeSync();
    }
  });

  return (
    <Router
      root={props => (
        <MetaProvider>
          <Title>do.tildom</Title>
          <Meta name="theme-color" content="#24292e" />
          <Link rel="manifest" href="/manifest.json" />
          <Show when={!isOnline()}>
            <div class="offline-banner" role="status">
              Offline. Local tasks still work. AI breakdown and sync will reconnect later.
            </div>
          </Show>
          <Suspense>{props.children}</Suspense>
        </MetaProvider>
      )}
    >
      <Route path="/" component={Home} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/pair" component={PairPage} />
      <Route path="*404" component={NotFound} />
    </Router>
  );
}
