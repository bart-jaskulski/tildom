export const formatTime = (timestamp: number) => new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(timestamp);

export const compactDate = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const minutes = Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (date.toDateString() === now.toDateString()) return `today · ${formatTime(timestamp)}`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "yesterday";
  return minutes < 7 * 24 * 60 ? `${Math.floor(minutes / 1_440)}d` : date.toLocaleDateString([], { month: "short", day: "numeric" });
};
