import { Link, Meta, MetaProvider, Title } from "@solidjs/meta";
import { Route, Router } from "@solidjs/router";
import { Show, Suspense, onMount } from "solid-js";
import NotFound from "~/routes/[...404]";
import Home from "~/routes/index";
import ItemPage from "~/routes/item/[id]";
import Settings from "~/routes/settings";
import ShareTarget from "~/routes/share-target";
import { requestPersistentStorage } from "~/lib/persistentStorage";
import { initializeEntryStore } from "~/stores/entryStore";
import { isOnline } from "~/stores/networkStore";
import "./app.css";

export default function App() {
  onMount(async () => {
    void requestPersistentStorage();
    await initializeEntryStore();
  });

  return (
    <Router
      root={props => (
        <MetaProvider>
          <Title>mark.tildom</Title>
          <Meta name="theme-color" content="#d73a49" />
          <Link rel="icon" href="/icon.svg" type="image/svg+xml" />
          <Link rel="manifest" href="/manifest.json" />
          <Show when={!isOnline()}>
            <div class="offline-banner" role="status">
              Offline. Local capture, comments, and search still work.
            </div>
          </Show>
          <Suspense>{props.children}</Suspense>
        </MetaProvider>
      )}
    >
      <Route path="/" component={Home} />
      <Route path="/item/:id" component={ItemPage} />
      <Route path="/settings" component={Settings} />
      <Route path="/share-target" component={ShareTarget} />
      <Route path="*404" component={NotFound} />
    </Router>
  );
}
