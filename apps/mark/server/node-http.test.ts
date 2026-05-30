import { describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import { toFetchRequest } from "./node-http";

describe("node to fetch request adapter", () => {
  it("ignores http pseudo headers", () => {
    const request = {
      headers: {
        ":method": "GET",
        ":path": "/api/metadata",
        "content-type": "application/json",
      },
      method: "GET",
      url: "/api/metadata",
    } as unknown as IncomingMessage;

    const fetchRequest = toFetchRequest(request, "http://127.0.0.1:5173");

    expect(fetchRequest.method).toBe("GET");
    expect(fetchRequest.headers.get("content-type")).toBe("application/json");
    expect([...fetchRequest.headers.keys()]).toEqual(["content-type"]);
  });
});
