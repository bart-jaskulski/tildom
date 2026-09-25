import { Router, Route, useLocation, useNavigate } from "@solidjs/router";
import { MetaProvider, Meta, Title } from "@solidjs/meta";
import { lazy, onMount, Show, Suspense, type ParentProps } from "solid-js";
import { VimNavigationProvider, type VimKeymap } from "@tildom/ui";
import AppNav from "./components/AppNav";
import Home from "./routes/index";
import PersonLoading from "./routes/person/PersonLoading";
import { initializeSync } from "./lib/syncClient";
import { initializeContactStore } from "./stores/contactStore";
import { pwaInstall } from "./lib/pwaInstall";
import "./app.css";

const PersonDetail = lazy(() => import("./routes/person/[id]"));
const Settings = lazy(() => import("./routes/settings"));
const Pair = lazy(() => import("./routes/pair"));
const SuiteCallback = lazy(() => import("./routes/suite"));

function KinVimNavigation(props: ParentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const keymaps: VimKeymap[] = [
    { lhs: ["gt", "gT"], callback: () => navigate(location.pathname === "/settings" ? "/" : "/settings"), help: "change tab" },
    { lhs: "h", callback: () => window.history.back(), help: "back" },
    { lhs: "l", callback: () => window.history.forward(), help: "forward" },
    {
      lhs: "/",
      callback: () => {
        const input = document.querySelector("[data-kin-search]") as HTMLInputElement | null;
        input?.focus();
        input?.select();
      },
      help: "search",
    },
    { lhs: "Escape", callback: () => { if (location.pathname !== "/") navigate("/"); }, help: "return to people" },
  ];

  return <VimNavigationProvider keymaps={keymaps}>{props.children}</VimNavigationProvider>;
}

function RouteLoading() {
  const location = useLocation();
  const isPersonRoute = () => location.pathname.startsWith("/person/");

  return (
    <main class="kin-page" aria-busy="true">
      <AppNav active={location.pathname === "/settings" ? "settings" : "people"} />
      <Show
        when={isPersonRoute()}
        fallback={<section class="kin-content" />}
      >
        <section class="kin-content"><PersonLoading /></section>
      </Show>
    </main>
  );
}

export default function App() {
  onMount(async () => {
    pwaInstall.initialize();
    await initializeContactStore();
    window.setTimeout(() => void initializeSync(), 1_000);
  });

  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>kin.tildom</Title>
          <Meta name="theme-color" content="#d73a49" />
          <KinVimNavigation>
            <Suspense fallback={<RouteLoading />}>
              {props.children}
            </Suspense>
          </KinVimNavigation>
        </MetaProvider>
      )}
    >
      <Route path="/" component={Home} />
      <Route path="/person/:slug" component={PersonDetail} />
      <Route path="/settings" component={Settings} />
      <Route path="/pair" component={Pair} />
      <Route path="/suite/:operation" component={SuiteCallback} />
    </Router>
  );
}
