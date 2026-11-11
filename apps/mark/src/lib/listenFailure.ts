export function listenFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "Audio generation failed.";
  const memoryFailure = /failed to allocate|out of memory|memory allocation|array buffer allocation failed/i.test(message);
  return {
    error: memoryFailure
      ? "This browser could not allocate enough memory for the voice model. Close other tabs and apps, then reload Mark. If it still fails, this device may need a smaller model."
      : message,
    retryable: !memoryFailure,
  };
}
