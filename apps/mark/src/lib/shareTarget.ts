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

  if (payload.text && payload.title && payload.text !== payload.title) {
    return `${payload.title}\n\n${payload.text}`;
  }

  return payload.text ?? payload.title;
};
