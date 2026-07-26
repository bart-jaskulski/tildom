const startupName = (name: string) => `mark:${name}`;

export const markStartup = (name: string) => {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  performance.mark(startupName(name));
};

export const measureStartup = (name: string, start: string, end: string) => {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return;

  try {
    performance.measure(startupName(name), startupName(start), startupName(end));
  } catch {
    // A missing earlier mark should never affect application startup.
  }
};
