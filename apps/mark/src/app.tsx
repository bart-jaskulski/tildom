import { Route, Router } from "@solidjs/router";
import { lazy, onMount } from "solid-js";
import Home from "~/routes/index";
import { requestPersistentStorage } from "~/lib/persistentStorage";
import { initializeEntryStore } from "~/stores/entryStore";
import Layout from "~/components/Layout";
import { pwaInstall } from "~/lib/pwaInstall";
import "./app.css";
import { LucideProvider } from "lucide-solid";

const NotFound = lazy(() => import("~/routes/[...404]"));
const ItemPage = lazy(() => import("~/routes/item/[id]"));
const ItemReaderPage = lazy(() => import("~/routes/item/[id]/read"));
const Pair = lazy(() => import("~/routes/pair"));
const Settings = lazy(() => import("~/routes/settings"));
const ShareTarget = lazy(() => import("~/routes/share-target"));
const SuiteCallback = lazy(() => import("~/routes/suite"));

export default function App() {
  onMount(async () => {
    pwaInstall.initialize();
    void requestPersistentStorage();
    await initializeEntryStore();

    window.setTimeout(() => {
      void import("~/lib/syncClient")
        .then(({ initializeSync }) => initializeSync())
        .catch(console.error);
    }, 1_000);
  });

  return (
    <LucideProvider
      size={12}
      strokeWidth={1.5}
      >
    <Router
      root={Layout}
    >
      <Route path="/" component={Home} />
      <Route path="/item/:id" component={ItemPage} />
      <Route path="/item/:id/read" component={ItemReaderPage} />
      <Route path="/pair" component={Pair} />
      <Route path="/settings" component={Settings} />
      <Route path="/share-target" component={ShareTarget} />
      <Route path="/suite/:operation" component={SuiteCallback} />
      <Route path="*404" component={NotFound} />
    </Router>
    </LucideProvider>
  );
}
