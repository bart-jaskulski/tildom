export type DbMigration = {
  version: number;
  sql: string;
};

export type DbRequestBody =
  | {
      type: 'init';
      dbName: string;
      schema?: string;
      migrations?: DbMigration[];
      requiredTables?: string[];
    }
  | { type: 'exec'; sql: string; params?: any[]; txId?: number }
  | { type: 'query'; sql: string; params?: any[]; txId?: number }
  | { type: 'tx:start'; txId: number }
  | { type: 'tx:commit'; txId: number }
  | { type: 'tx:rollback'; txId: number }
  | { type: 'export' }
  | { type: 'import'; bytes: Uint8Array; dbName: string }
  | { type: 'close' }
  | { type: 'delete'; dbName: string };

export type DbRequest = DbRequestBody & { id: number };

export type DbResponse =
  | { id: number; type: 'success'; data?: any }
  | { id: number; type: 'error'; message: string }
  | { type: 'change' };
