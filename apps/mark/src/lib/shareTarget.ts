import { isUrlOnlyInput } from "./entries";

export type ShareTargetPayload = {
  title: string | null;
  text: string | null;
  url: string | null;
};

const normalizeShareValue = (value: string | null | undefined) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
};

export const readShareTargetPayload = (payload: Partial<Record<keyof ShareTargetPayload, string | null | undefined>>): ShareTargetPayload => ({
  title: normalizeShareValue(payload.title),
  text: normalizeShareValue(payload.text),
  url: normalizeShareValue(payload.url),
});

export const buildSharedEntryBody = (payload: ShareTargetPayload) => {
  if (payload.url) {
    return payload.url;
  }

  const body = payload.text && payload.title && payload.text !== payload.title
    ? `${payload.title}\n\n${payload.text}`
    : payload.text ?? payload.title;
  const lines = body?.split(/\r?\n/);
  const url = lines?.at(-1)?.trim();

  if (lines && !lines.at(-2)?.trim() && url && isUrlOnlyInput(url)) {
    return url;
  }

  return body;
};
