import "@testing-library/jest-dom/vitest";

if (typeof globalThis.ToggleEvent === "undefined") {
  globalThis.ToggleEvent = class ToggleEvent extends Event {
    oldState: string;
    newState: string;
    constructor(type: string, init?: { oldState?: string; newState?: string }) {
      super(type);
      this.oldState = init?.oldState ?? "closed";
      this.newState = init?.newState ?? "open";
    }
  } as unknown as typeof globalThis.ToggleEvent;
}

if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.show) {
    HTMLDialogElement.prototype.show = function () {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (returnValue?: string) {
      this.open = false;
      if (returnValue !== undefined) {
        this.returnValue = returnValue;
      }
      this.dispatchEvent(new Event("close"));
    };
  }
}

if (typeof HTMLElement !== "undefined") {
  if (!HTMLElement.prototype.showPopover) {
    HTMLElement.prototype.showPopover = function () {
      this.setAttribute(":popover-open", "");
      this.dispatchEvent(new (globalThis.ToggleEvent || Event)("beforetoggle", { oldState: "closed", newState: "open" } as ToggleEventInit));
      this.dispatchEvent(new (globalThis.ToggleEvent || Event)("toggle", { oldState: "closed", newState: "open" } as ToggleEventInit));
    };
  }
  if (!HTMLElement.prototype.hidePopover) {
    HTMLElement.prototype.hidePopover = function () {
      this.removeAttribute(":popover-open");
      this.dispatchEvent(new (globalThis.ToggleEvent || Event)("beforetoggle", { oldState: "open", newState: "closed" } as ToggleEventInit));
      this.dispatchEvent(new (globalThis.ToggleEvent || Event)("toggle", { oldState: "open", newState: "closed" } as ToggleEventInit));
    };
  }
  if (!HTMLElement.prototype.togglePopover) {
    HTMLElement.prototype.togglePopover = function (force?: boolean) {
      const isOpen = this.hasAttribute(":popover-open");
      const shouldOpen = force !== undefined ? force : !isOpen;
      if (shouldOpen) {
        this.showPopover();
      } else {
        this.hidePopover();
      }
      return shouldOpen;
    };
  }
}
