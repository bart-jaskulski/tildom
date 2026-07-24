import { createSignal } from "solid-js";

type InstallPrompt = Event & { prompt: () => Promise<void> };

export const createPwaInstall = () => {
  const [installPrompt, setInstallPrompt] = createSignal<InstallPrompt | null>(null);
  const [needsSafariInstructions, setNeedsSafariInstructions] = createSignal(false);
  let initialized = false;

  return {
    available: installPrompt,
    needsSafariInstructions,
    initialize: () => {
      if (initialized) return;
      initialized = true;
      setNeedsSafariInstructions(
        /iPhone|iPad|iPod/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
      );
      window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        setInstallPrompt(event as InstallPrompt);
      });
      window.addEventListener("appinstalled", () => setInstallPrompt(null));
    },
    prompt: async () => {
      const event = installPrompt();
      if (!event) return;
      await event.prompt();
      setInstallPrompt(null);
    },
  };
};
