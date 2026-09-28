import type { Accessor, Setter } from "solid-js";
import { Search, Tabline } from "@tildom/ui";
import type { Surface } from "../lib/types";

type Props = {
  surface: Accessor<Surface>;
  setSurface: Setter<Surface>;
};

export default function AppHeader(props: Props) {
  const selectSurface = (surface: Surface) => props.setSurface(surface);

  return (
    <Tabline>
      <Tabline.Brand app="hey" onClick={() => selectSurface("chats")} />
      <Tabline.Nav>
        <Tabline.Tab active={props.surface() === "chats"} onClick={() => selectSurface("chats")}>chats.db</Tabline.Tab>
        <Tabline.Tab active={props.surface() === "memory"} onClick={() => selectSurface("memory")}>memory/</Tabline.Tab>
        <Tabline.Tab active={props.surface() === "settings"} onClick={() => selectSurface("settings")}>settings.json</Tabline.Tab>
      </Tabline.Nav>
      <Search.Input
        placeholder="search chats and memory"
        label="Search chats and memory"
      />
    </Tabline>
  );
}
