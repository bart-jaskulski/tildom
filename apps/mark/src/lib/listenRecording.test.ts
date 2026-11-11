import { expect, it } from "vitest";
import { checkpointSamples } from "./listenRecording";

it("resumes from the last completed sentence and discards an unfinished tail", () => {
  expect(checkpointSamples({ ends: [24000, 48000], complete: false }, 60000 * 4, 3)).toBe(48000);
});

it("rejects checkpoints extending beyond saved audio", () => {
  expect(() => checkpointSamples({ ends: [48000], complete: false }, 24000 * 4, 2)).toThrow();
  expect(() => checkpointSamples({ ends: [24000, 12000], complete: false }, 48000 * 4, 2)).toThrow();
});
