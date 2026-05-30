import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { TLSSocket } from "node:tls";

const hasBody = (method: string) => method !== "GET" && method !== "HEAD";
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

const isValidHeaderName = (name: string) =>
  !name.startsWith(":") && HEADER_NAME_PATTERN.test(name);

const toFetchHeaders = (headers: IncomingMessage["headers"]) => {
  const fetchHeaders = new Headers();

  for (const [name, value] of Object.entries(headers)) {
    if (!isValidHeaderName(name)) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const headerValue of value) {
        fetchHeaders.append(name, headerValue);
      }
      continue;
    }

    if (typeof value === "string") {
      fetchHeaders.set(name, value);
    }
  }

  return fetchHeaders;
};

export const getRequestOrigin = (request: IncomingMessage, fallbackHost: string) => {
  const protocol = isTlsSocket(request.socket) && request.socket.encrypted ? "https" : "http";
  return `${protocol}://${request.headers.host ?? fallbackHost}`;
};

const isTlsSocket = (socket: IncomingMessage["socket"]): socket is TLSSocket =>
  "encrypted" in socket;

export const toFetchRequest = (request: IncomingMessage, origin: string) => {
  const method = request.method ?? "GET";
  const requestInit: RequestInit & { duplex?: "half" } = {
    method,
    headers: toFetchHeaders(request.headers),
  };

  if (hasBody(method)) {
    requestInit.body = Readable.toWeb(request) as unknown as ReadableStream<Uint8Array>;
    requestInit.duplex = "half";
  }

  return new Request(new URL(request.url ?? "/", origin), requestInit);
};

export const sendFetchResponse = async (
  response: ServerResponse,
  fetchResponse: Response,
) => {
  response.statusCode = fetchResponse.status;

  fetchResponse.headers.forEach((value, name) => {
    response.setHeader(name, value);
  });

  if (!fetchResponse.body) {
    response.end();
    return;
  }

  const body = Readable.fromWeb(fetchResponse.body as NodeReadableStream);
  await new Promise<void>((resolve, reject) => {
    body.on("error", reject);
    response.on("error", reject);
    body.on("end", () => resolve());
    body.pipe(response);
  });
};

export const handleNodeRequestWithFetch = async (
  request: IncomingMessage,
  response: ServerResponse,
  origin: string,
  handler: (request: Request) => Response | Promise<Response>,
) => {
  const fetchRequest = toFetchRequest(request, origin);
  const fetchResponse = await handler(fetchRequest);
  await sendFetchResponse(response, fetchResponse);
};
