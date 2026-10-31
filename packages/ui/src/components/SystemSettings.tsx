import { JSX, Show, splitProps } from "solid-js";
import Button from "./Button";
import Checkbox from "./Checkbox";
import { SettingsSection, SettingsRow } from "./Settings";
import styles from "./SystemSettings.module.css";

export interface PwaInstallTarget {
  available: () => unknown;
  needsSafariInstructions: () => boolean;
  prompt: () => Promise<void>;
}

export interface SystemSettingsProps extends JSX.HTMLAttributes<HTMLElement> {
  vimKeys?: boolean;
  onVimKeysChange?: (checked: boolean) => void;
  pwaInstall?: PwaInstallTarget;
  appName?: string;
  children?: JSX.Element;
}

export default function SystemSettings(props: SystemSettingsProps) {
  const [local, others] = splitProps(props, [
    "vimKeys",
    "onVimKeysChange",
    "pwaInstall",
    "appName",
    "children",
    "class",
  ]);

  const hasPwa = () => Boolean(
    local.pwaInstall && (local.pwaInstall.available() || local.pwaInstall.needsSafariInstructions()),
  );

  return (
    <SettingsSection title="system" class={local.class} {...others}>
      <Show when={local.onVimKeysChange}>
        <SettingsRow label="navigation" hint="j/k, gg, G">
          <Checkbox
            checked={Boolean(local.vimKeys)}
            onChange={(checked) => local.onVimKeysChange?.(checked)}
            label="vim keys"
          />
        </SettingsRow>
      </Show>

      <Show when={hasPwa()}>
        <SettingsRow label="app">
          <Show when={local.pwaInstall?.available()}>
            <Button
              type="button"
              bracket
              onClick={() => void local.pwaInstall?.prompt()}
            >
              install {local.appName ?? "app"}
            </Button>
          </Show>
          <Show when={!local.pwaInstall?.available() && local.pwaInstall?.needsSafariInstructions()}>
            <span class={styles.muted}>Safari: Share → Add to Home Screen</span>
          </Show>
        </SettingsRow>
      </Show>

      {local.children}
    </SettingsSection>
  );
}
