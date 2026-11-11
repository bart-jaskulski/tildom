import { expect, it } from "vitest";
import { listenFailure } from "./listenFailure";

it("does not suggest repeating a model allocation that exceeded available memory", () => {
  const failure = listenFailure(new Error("Can't create a session. failed to allocate a buffer of size 92361116."));
  expect(failure.retryable).toBe(false);
});

it("allows retrying a temporary model download failure", () => {
  const failure = listenFailure(new TypeError("Failed to fetch"));
  expect(failure.retryable).toBe(true);
});
