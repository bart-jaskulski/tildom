import type { SyncConfig } from "./state";

const readHash = () => new URLSearchParams(location.hash.slice(1));

const returnToBroker = (brokerOrigin: string, values: Record<string, string>) => {
  const url = new URL("/sync", brokerOrigin);
  url.hash = new URLSearchParams(values).toString();
  location.replace(url);
};

export const registerAppWithSuite = async (
  appId: string,
  brokerOrigin: string,
  getConfig: () => Promise<SyncConfig | undefined>,
) => {
  const state = readHash().get("state");
  history.replaceState(history.state, "", location.pathname);
  if (!state) throw new Error("Missing suite transaction state");
  const config = await getConfig();
  if (!config) throw new Error("Sync is not enabled for this app");
  returnToBroker(brokerOrigin, { app: appId, secret: config.secret, state });
};

export const connectAppToSuite = async (
  appId: string,
  brokerOrigin: string,
  getConfig: () => Promise<SyncConfig | undefined>,
  join: (secret: string) => Promise<unknown>,
) => {
  const values = readHash();
  const state = values.get("state");
  const secret = values.get("secret");
  history.replaceState(history.state, "", location.pathname);
  if (!state || !secret) throw new Error("Invalid suite connection request");
  if (await getConfig()) throw new Error("This app is already connected to a sync vault");
  if (!window.confirm(`Connect ${appId} to suite sync? This replaces this device with the remote vault when one exists.`)) {
    throw new Error("Connection cancelled");
  }
  await join(secret);
  returnToBroker(brokerOrigin, { app: appId, state });
};
