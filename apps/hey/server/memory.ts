export const safePath = (path: string) =>
  path.length > 0 &&
  path.length <= 240 &&
  !path.startsWith("/") &&
  !path.includes("\\") &&
  path.split("/").every((part) => part && part !== "." && part !== "..");
