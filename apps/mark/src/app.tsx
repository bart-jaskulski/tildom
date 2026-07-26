import { Meta, MetaProvider, Title } from "@solidjs/meta";
import { Route, Router, useLocation, useNavigate } from "@solidjs/router";
import { Suspense, lazy, onMount, type ParentProps } from "solid-js";
import { VimNavigationProvider, type VimKeymap } from "@tildom/ui";
import Home from "~/routes/index";
import { requestPersistentStorage } from "~/lib/persistentStorage";
import { initializeEntryStore } from "~/stores/entryStore";
import AppNav from "~/components/AppNav";
import KeybindHelp from "~/components/KeybindHelp";
import { pwaInstall } from "~/lib/pwaInstall";
import "./app.css";

const NotFound = lazy(() => import("~/routes/[...404]"));
const ItemPage = lazy(() => import("~/routes/item/[id]"));
const Pair = lazy(() => import("~/routes/pair"));
const Settings = lazy(() => import("~/routes/settings"));
const ShareTarget = lazy(() => import("~/routes/share-target"));

function RouteLoading() {
  const location = useLocation();

  return (
    <main class="hn-page">
      <AppNav active={location.pathname === "/settings" ? "settings" : undefined} />
      <section class="hn-content">
        <p class="hn-status" role="status">Opening local view...</p>
      </section>
    </main>
  );
}

function MarkVimNavigation(props: ParentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const keymaps: VimKeymap[] = [
    {
      lhs: ["gt", "gT"],
      callback: () => navigate(location.pathname === "/settings" ? "/" : "/settings"),
      help: "change tab",
    },
    { lhs: "h", callback: () => window.history.back(), help: "back" },
    { lhs: "l", callback: () => window.history.forward(), help: "forward" },
    {
      lhs: "/",
      callback: () => {
        const searchInput = document.querySelector("[data-mark-search]") as HTMLInputElement | null;
        searchInput?.focus();
        searchInput?.select();
      },
      help: "search",
    },
    {
      lhs: "Escape",
      callback: () => {
        if (location.pathname !== "/") navigate("/");
      },
      help: "return to bookmarks",
    },
  ];

  return <VimNavigationProvider keymaps={keymaps}>{props.children}</VimNavigationProvider>;
}

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
    <Router
      root={props => (
        <MetaProvider>
          <Title>mark.tildom</Title>
          <Meta name="theme-color" content="#d73a49" />
          <MarkVimNavigation>
            <Suspense fallback={<RouteLoading />}>{props.children}</Suspense>
            <KeybindHelp />
          </MarkVimNavigation>
        </MetaProvider>
      )}
    >
      <Route path="/" component={Home} />
      <Route path="/item/:id" component={ItemPage} />
      <Route path="/pair" component={Pair} />
      <Route path="/settings" component={Settings} />
      <Route path="/share-target" component={ShareTarget} />
      <Route path="*404" component={NotFound} />
    </Router>
  );
}
