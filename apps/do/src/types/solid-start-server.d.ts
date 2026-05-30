declare module "@solidjs/start/server" {
  export type APIEvent = {
    request: Request;
    params: Record<string, string | undefined>;
    clientAddress?: string;
  };
}
