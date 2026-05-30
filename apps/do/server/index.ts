import { createServer, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApiRequest, isApiRequestPath } from "./app.ts";
import { getRequestOrigin, handleNodeRequestWithFetch, sendFetchResponse } from "./node-http.ts";
import { createProductionAssetHandler, RESPONSE_HEADERS } from "./production.ts";

import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
let ROOT_DIR = resolve(__dirname, "..");
if (!existsSync(resolve(ROOT_DIR, "package.json"))) {
  ROOT_DIR = resolve(__dirname, "../..");
}
const DIST_DIR = resolve(ROOT_DIR, "dist");
const PROD_INDEX_HTML_PATH = resolve(DIST_DIR, "index.html");
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const IS_PROD = process.env.NODE_ENV === "production";

const productionAssetHandler = createProductionAssetHandler({
  distDir: DIST_DIR,
  indexHtmlPath: PROD_INDEX_HTML_PATH,
});

const sendPlainText = (
  serverResponse: ServerResponse,
  statusCode: number,
  message: string,
) => {
  serverResponse.statusCode = statusCode;
  for (const [name, value] of Object.entries(RESPONSE_HEADERS)) {
    serverResponse.setHeader(name, value);
  }
  serverResponse.setHeader("Content-Type", "text/plain; charset=utf-8");
  serverResponse.end(message);
};

const start = async () => {
  const server = createServer(async (request, response) => {
    try {
      const origin = getRequestOrigin(request, `127.0.0.1:${PORT}`);
      const url = new URL(request.url ?? "/", origin);

      if (isApiRequestPath(url.pathname)) {
        await handleNodeRequestWithFetch(request, response, origin, handleApiRequest);
        return;
      }

      if (!IS_PROD) {
        sendPlainText(response, 404, "Not found");
        return;
      }

      const productionResponse = await productionAssetHandler(url.pathname);
      await sendFetchResponse(response, productionResponse);
    } catch (error) {
      sendPlainText(response, 500, error instanceof Error ? error.message : "Internal Server Error");
    }
  });

  server.listen(PORT, () => {
    console.log(`do.tildom server listening on http://127.0.0.1:${PORT}`);
  });
};

await start();
