import { Router, Route } from "@solidjs/router";
import { MetaProvider, Meta, Title, Link } from "@solidjs/meta";
import { onMount } from "solid-js";
import Home from "./routes/index";
import PersonDetail from "./routes/person/[id]";
import Settings from "./routes/settings";
import { initializeContactStore } from "./stores/contactStore";
import "./app.css";

export default function App() {
  onMount(async () => {
    await initializeContactStore();
  });

  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>kin.tildom</Title>
          <Meta name="theme-color" content="#005cc5" />
          <Link rel="icon" href="/icon.svg" type="image/svg+xml" />
          <Link rel="manifest" href="/manifest.json" />
          {props.children}
        </MetaProvider>
      )}
    >
      <Route path="/" component={Home} />
      <Route path="/person/:id" component={PersonDetail} />
      <Route path="/settings" component={Settings} />
    </Router>
  );
}
