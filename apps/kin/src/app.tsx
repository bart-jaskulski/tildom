import { Router, Route, useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { MetaProvider, Meta, Title } from "@solidjs/meta";
import { lazy, onMount, Show, Suspense, type ParentProps } from "solid-js";
import { KeybindHelp, Search, VimNavigationProvider, type VimKeymap } from "@tildom/ui";
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
const ShowcasePage = lazy(() =>
  import("@tildom/ui").then((m) => ({
    default: () => <m.Showcase currentApp="kin" returnHref="/" />,
  }))
);

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
      root={(props) => {
        const location = useLocation();
        const navigate = useNavigate();
        const [params, setParams] = useSearchParams();

        const searchQuery = () => String(params.q ?? "");
        const handleSearch = (rawQuery: string) => {
          const nextQuery = rawQuery.trim();
          if (location.pathname === "/") {
            setParams({ q: nextQuery || undefined }, { replace: true });
          } else {
            navigate(nextQuery ? `/?q=${encodeURIComponent(nextQuery)}` : "/");
          }
        };

        const activeNav = () => {
          if (location.pathname === "/settings") return "settings";
          if (location.pathname === "/showcase") return "showcase";
          return "people";
        };
        const isShowcase = () => location.pathname === "/showcase";

        return (
          <MetaProvider>
            <Title>{isShowcase() ? "showcase | kin.tildom" : "kin.tildom"}</Title>
            <Meta name="theme-color" content="#d73a49" />
            <Search query={searchQuery} onSearch={handleSearch}>
              <KinVimNavigation>
                <Show
                  when={!isShowcase()}
                  fallback={
                    <div class="kin-page">
                      <AppNav active={activeNav()} />
                      {props.children}
                    </div>
                  }
                >
                  <Suspense fallback={<RouteLoading />}>
                    {props.children}
                  </Suspense>
                </Show>
                <KeybindHelp />
              </KinVimNavigation>
            </Search>
          </MetaProvider>
        );
      }}
    >
      <Route path="/" component={Home} />
      <Route path="/person/:slug" component={PersonDetail} />
      <Route path="/settings" component={Settings} />
      <Route path="/showcase" component={ShowcasePage} />
      <Route path="/pair" component={Pair} />
      <Route path="/suite/:operation" component={SuiteCallback} />
    </Router>
  );
}
