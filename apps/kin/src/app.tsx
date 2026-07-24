import { Router, Route, useLocation, useNavigate } from "@solidjs/router";
import { MetaProvider, Meta, Title, Link } from "@solidjs/meta";
import { onMount, type ParentProps } from "solid-js";
import { VimNavigationProvider, type VimKeymap } from "@tildom/ui";
import Home from "./routes/index";
import PersonDetail from "./routes/person/[id]";
import Settings from "./routes/settings";
import Pair from "./routes/pair";
import { initializeSync } from "./lib/syncClient";
import { initializeContactStore } from "./stores/contactStore";
import { pwaInstall } from "./lib/pwaInstall";
import "./app.css";

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
          <Meta name="theme-color" content="#005cc5" />
          <Link rel="icon" href="/icon.svg" type="image/svg+xml" />
          <Link rel="manifest" href="/manifest.json" />
          <KinVimNavigation>{props.children}</KinVimNavigation>
        </MetaProvider>
      )}
    >
      <Route path="/" component={Home} />
      <Route path="/person/:slug" component={PersonDetail} />
      <Route path="/settings" component={Settings} />
      <Route path="/pair" component={Pair} />
    </Router>
  );
}
