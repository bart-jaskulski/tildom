import { Meta, MetaProvider, Title } from "@solidjs/meta";
import { useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { Show, Suspense, type ParentProps } from "solid-js";
import { KeybindHelp, Search, Tabline } from "@tildom/ui";
import ItemLoading from "~/components/ItemLoading";
import MarkVimNavigation from "~/components/MarkVimNavigation";
import styles from "./Layout.module.css";

function RouteLoading() {
  return <p class={styles.loading} role="status">Opening local view...</p>;
}

export default function Layout(props: ParentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const searchQuery = () => String(params.q ?? "");
  const handleSearch = (rawQuery: string) => {
    const query = rawQuery.trim();
    if (location.pathname === "/") {
      setParams({ q: query || undefined, page: undefined }, { replace: true });
      return;
    }
    navigate(query ? `/?q=${encodeURIComponent(query)}` : "/");
  };

  const activeTab = () => {
    if (location.pathname === "/settings") return "settings";
    if (location.pathname === "/showcase") return "showcase";
    return undefined;
  };
  const isShowcase = () => location.pathname === "/showcase";

  return (
    <MetaProvider>
      <Title>{isShowcase() ? "showcase | mark.tildom" : "mark.tildom"}</Title>
      <Meta name="theme-color" content="#d73a49" />
      <Search query={searchQuery} onSearch={handleSearch}>
        <MarkVimNavigation>
          <div class={styles.page}>
            <Tabline>
              <Tabline.Brand app="mark" />
              <Tabline.Nav>
                <Tabline.Tab href="/" active={!activeTab()}>bookmarks.db</Tabline.Tab>
                <Tabline.Tab href="/settings" active={activeTab() === "settings"}>settings.json</Tabline.Tab>
                <Show when={import.meta.env.DEV}>
                  <Tabline.Tab href="/showcase" active={activeTab() === "showcase"}>showcase.dev</Tabline.Tab>
                </Show>
              </Tabline.Nav>
              <Search.Input
                dataAttribute="data-mark-search"
                placeholder="search"
                label="Search saved links"
              />
            </Tabline>
            <Show
              when={!isShowcase()}
              fallback={props.children}
            >
              <main class={styles.content}>
                <Suspense fallback={location.pathname.startsWith("/item/") || location.pathname === "/share-target" ? <ItemLoading /> : <RouteLoading />}>
                  {props.children}
                </Suspense>
              </main>
            </Show>
          </div>
          <KeybindHelp />
        </MarkVimNavigation>
      </Search>
    </MetaProvider>
  );
}
