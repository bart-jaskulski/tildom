import { createServer } from "node:http";
import { app } from "./app.ts";
import { sendResponse, toRequest } from "./node-http.ts";

const PORT = Number.parseInt(process.env.PORT ?? "8787", 10);

const server = createServer(async (request, response) => {
  try {
    const origin = `http://${request.headers.host ?? `127.0.0.1:${PORT}`}`;
    await sendResponse(response, await app.fetch(toRequest(request, origin)));
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end(error instanceof Error ? error.message : "Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`sync.tildom service listening on http://127.0.0.1:${PORT}`);
});
