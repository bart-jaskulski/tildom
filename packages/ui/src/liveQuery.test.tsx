import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { createLiveQuery, type SubscribableDb } from "./liveQuery";

describe("createLiveQuery", () => {
  it("subscribes to db changes and triggers refetch", async () => {
    let subscriber: (() => void) | undefined;
    const db: SubscribableDb = {
      subscribe: vi.fn((listener) => {
        subscriber = listener;
        return () => {
          subscriber = undefined;
        };
      }),
    };

    let fetchCount = 0;
    const queryFn = vi.fn(async () => {
      fetchCount += 1;
      return [`item-${fetchCount}`];
    });

    render(() => {
      const [items] = createLiveQuery(db, queryFn);
      return <div>{items()?.[0]}</div>;
    });

    expect(db.subscribe).toHaveBeenCalled();
    expect(queryFn).toHaveBeenCalledTimes(1);

    // Wait for initial query to resolve
    await Promise.resolve();

    // Trigger db change event
    subscriber?.();
    await Promise.resolve();

    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});
