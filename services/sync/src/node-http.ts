import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

const hasBody = (method: string) => method !== "GET" && method !== "HEAD";

const toHeaders = (headers: IncomingMessage["headers"]) => {
  const result = new Headers();

  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      value.forEach((item) => result.append(name, item));
    } else if (typeof value === "string") {
      result.set(name, value);
    }
  }

  return result;
};

export const toRequest = (request: IncomingMessage, origin: string) => {
  const method = request.method ?? "GET";
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: toHeaders(request.headers),
  };

  if (hasBody(method)) {
    init.body = Readable.toWeb(request) as unknown as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }

  return new Request(new URL(request.url ?? "/", origin), init);
};

export const sendResponse = async (response: ServerResponse, fetchResponse: Response) => {
  response.statusCode = fetchResponse.status;
  fetchResponse.headers.forEach((value, name) => response.setHeader(name, value));

  if (!fetchResponse.body) {
    response.end();
    return;
  }

  const body = Readable.fromWeb(fetchResponse.body as NodeReadableStream);
  await new Promise<void>((resolve, reject) => {
    body.on("error", reject);
    response.on("error", reject);
    body.on("end", resolve);
    body.pipe(response);
  });
};
