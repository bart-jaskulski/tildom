import { Meta, MetaProvider, Title } from "@solidjs/meta";
import { useLocation } from "@solidjs/router";
import { Suspense, type ParentProps } from "solid-js";
import Tabline from "~/components/Tabline";
import ItemLoading from "~/components/ItemLoading";
import KeybindHelp from "~/components/KeybindHelp";
import MarkVimNavigation from "~/components/MarkVimNavigation";
import styles from "./Layout.module.css";

function RouteLoading() {
  return <p class={styles.loading} role="status">Opening local view...</p>;
}

export default function Layout(props: ParentProps) {
  const location = useLocation();

  return (
    <MetaProvider>
      <Title>mark.tildom</Title>
      <Meta name="theme-color" content="#d73a49" />
      <MarkVimNavigation>
        <div class={styles.page}>
          <Tabline active={location.pathname === "/settings" ? "settings" : undefined} />
          <main class={styles.content}>
            <Suspense fallback={location.pathname.startsWith("/item/") || location.pathname === "/share-target" ? <ItemLoading /> : <RouteLoading />}>
              {props.children}
            </Suspense>
          </main>
        </div>
        <KeybindHelp />
      </MarkVimNavigation>
    </MetaProvider>
  );
}
