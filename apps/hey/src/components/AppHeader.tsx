import { useLocation } from "@solidjs/router";
import { Search, Tabline } from "@tildom/ui";

export default function AppHeader() {
  const location = useLocation();
  return (
    <Tabline>
      <Tabline.Brand app="hey" href="/" />
      <Tabline.Nav>
        <Tabline.Tab href="/" active={location.pathname === "/"}>chats.db</Tabline.Tab>
        <Tabline.Tab href="/memory" active={location.pathname === "/memory"}>memory/</Tabline.Tab>
        <Tabline.Tab href="/settings" active={location.pathname === "/settings"}>settings.json</Tabline.Tab>
      </Tabline.Nav>
      <Search.Input placeholder="search chats and memory" label="Search chats and memory" />
    </Tabline>
  );
}
