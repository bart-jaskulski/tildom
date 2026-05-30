export const requestPersistentStorage = async () => {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return false;
  }

  try {
    if (navigator.storage.persisted && await navigator.storage.persisted()) {
      return true;
    }

    return await navigator.storage.persist();
  } catch {
    return false;
  }
};
