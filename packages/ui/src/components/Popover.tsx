import { JSX, createEffect, onCleanup, onMount } from "solid-js";
import styles from "./Popover.module.css";

export interface PopoverProps {
  id: string;
  popoverType?: "auto" | "manual";
  open?: boolean;
  onToggle?: (isOpen: boolean) => void;
  anchorName?: string;
  positionArea?: string;
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
  ref?: (element: HTMLElement) => void;
}

export default function Popover(props: PopoverProps) {
  let elementRef: HTMLElement | undefined;

  createEffect(() => {
    if (!elementRef || props.open === undefined) return;
    const isShowing = elementRef.matches?.(":popover-open") ?? false;
    if (props.open && !isShowing) {
      try {
        elementRef.showPopover();
      } catch {
        // Fallback or ignore if unsupported in older environments
      }
    } else if (!props.open && isShowing) {
      try {
        elementRef.hidePopover();
      } catch {
        // Fallback or ignore if unsupported in older environments
      }
    }
  });

  onMount(() => {
    if (elementRef) {
      props.ref?.(elementRef);
    }
  });

  onCleanup(() => {
    if (elementRef) {
      try {
        elementRef.hidePopover();
      } catch {
        // Ignored
      }
    }
  });

  const anchorStyles = (): JSX.CSSProperties => {
    const s: Record<string, string | undefined> = {};
    if (props.anchorName) {
      s["position-anchor"] = props.anchorName;
    }
    if (props.positionArea) {
      s["position-area"] = props.positionArea;
    }
    return s as JSX.CSSProperties;
  };

  return (
    <div
      id={props.id}
      ref={(el) => {
        elementRef = el;
        props.ref?.(el);
      }}
      popover={props.popoverType ?? "auto"}
      class={`${styles.popover} ${props.class ?? ""}`.trim()}
      style={{
        ...anchorStyles(),
        ...(typeof props.style === "object" ? props.style : {}),
      }}
      onToggle={(event: Event) => {
        const toggleEvent = event as Event & { newState?: string };
        const isOpen = toggleEvent.newState === "open";
        props.onToggle?.(isOpen);
      }}
    >
      {props.children}
    </div>
  );
}
