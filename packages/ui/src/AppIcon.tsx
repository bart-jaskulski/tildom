import { Match, Switch } from "solid-js";

export type AppIconName = "home" | "mark" | "do" | "kin" | "hey";

type AppIconProps = {
  app: AppIconName;
  class?: string;
};

export function AppIcon(props: AppIconProps) {
  return (
    <svg class={props.class} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" fill="#24292e" />
      <rect x="8" y="8" width="48" height="48" fill="#d73a49" />
      <Switch>
        <Match when={props.app === "home"}>
          <path fill="#fff" d="M18 18h11v11H18zm17 0h11v11H35zM18 35h11v11H18zm17 0h11v11H35z" />
        </Match>
        <Match when={props.app === "mark"}>
          <path fill="#fff" d="M21 16h22v34L32 43l-11 7z" />
        </Match>
        <Match when={props.app === "do"}>
          <path d="M19 19h26v26H19z" fill="none" stroke="#fff" stroke-width="5" />
          <path d="m24 32 6 6 11-13" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter" />
        </Match>
        <Match when={props.app === "kin"}>
          <path d="m22 22 10 20 10-20M22 22h20" fill="none" stroke="#fff" stroke-width="5" />
          <path fill="#fff" d="M17 17h10v10H17zm20 0h10v10H37zM27 37h10v10H27z" />
        </Match>
        <Match when={props.app === "hey"}>
          <path fill="#fff" d="m17 20 14 12-14 12v-8l5-4-5-4zm17 18h13v6H34z" />
        </Match>
      </Switch>
    </svg>
  );
}
