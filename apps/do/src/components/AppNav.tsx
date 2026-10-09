import { Tabline } from "@tildom/ui";

export default function AppNav(props: { active: "tasks" | "settings" | "pair" }) {
  return (
    <Tabline>
      <Tabline.Brand app="do" href="/" />
      <Tabline.Nav>
        <Tabline.Tab href="/" active={props.active === "tasks"}>tasks.db</Tabline.Tab>
        <Tabline.Tab href="/settings" active={props.active === "settings"}>settings.json</Tabline.Tab>
        <Tabline.Tab href="/pair" active={props.active === "pair"}>pair.conf</Tabline.Tab>
      </Tabline.Nav>
    </Tabline>
  );
}
