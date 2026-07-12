import { createContext, createEffect, createSignal, onCleanup, useContext, type ParentProps } from "solid-js";
import { createVimNavigation, setActiveVimKeymaps, type VimKeymap } from "./keyboard.ts";

const VimNavigationContext = createContext<{ setKeymaps: (keymaps: VimKeymap[]) => void }>();

export function VimNavigationProvider(props: ParentProps<{ keymaps?: VimKeymap[] }>) {
  const [localKeymaps, setLocalKeymaps] = createSignal<VimKeymap[]>([]);
  const keymaps = () => [...(props.keymaps ?? []), ...localKeymaps()];
  createVimNavigation(keymaps);
  createEffect(() => setActiveVimKeymaps(keymaps()));

  return <VimNavigationContext.Provider value={{ setKeymaps: setLocalKeymaps }}>{props.children}</VimNavigationContext.Provider>;
}

export function useVimKeymaps(keymaps: VimKeymap[]) {
  const navigation = useContext(VimNavigationContext);
  if (!navigation) throw new Error("useVimKeymaps must be used inside VimNavigationProvider");

  createEffect(() => {
    navigation.setKeymaps(keymaps);
  });
  onCleanup(() => {
    navigation.setKeymaps([]);
  });
}
