import { Show } from "solid-js";
import { Search, Tabline } from "@tildom/ui";

type AppNavProps = {
  active?: "settings" | "people" | "showcase";
};

export default function AppNav(props: AppNavProps) {
  return (
    <Tabline>
      <Tabline.Brand app="kin" />
      <Tabline.Nav>
        <Tabline.Tab href="/" active={props.active === "people"}>people.db</Tabline.Tab>
        <Tabline.Tab href="/settings" active={props.active === "settings"}>settings.json</Tabline.Tab>
        <Show when={import.meta.env.DEV}>
          <Tabline.Tab href="/showcase" active={props.active === "showcase"}>showcase.dev</Tabline.Tab>
        </Show>
      </Tabline.Nav>
      <Search.Input
        dataAttribute="data-kin-search"
        placeholder="search people and notes"
        label="Search people and notes"
      />
    </Tabline>
  );
}
