export interface SqlDatabase {
  exec: (sql: string) => void;
  query: <T>(sql: string) => T[];
}

export const quoteIdent = (id: string): string => `"${id.replace(/"/g, '""')}"`;

export const mergeAttachedRemoteDb = (db: SqlDatabase): void => {
  db.exec("BEGIN TRANSACTION;");
  db.exec("PRAGMA defer_foreign_keys = ON;");

  try {
    const tables = db.query<{ name: string; sql: string }>(
      `SELECT name, sql FROM remote.sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
    );

    const shadowSuffixes = ["_data", "_idx", "_content", "_docsize", "_config"];

    for (const table of tables) {
      if (
        (table.sql && table.sql.toUpperCase().includes("VIRTUAL TABLE")) ||
        table.name.includes("_fts") ||
        shadowSuffixes.some((suffix) => table.name.endsWith(suffix))
      ) {
        continue;
      }

      const remoteCols = db.query<{ name: string; pk: number }>(
        `PRAGMA remote.table_info(${quoteIdent(table.name)})`
      );
      const mainCols = db.query<{ name: string; pk: number }>(
        `PRAGMA main.table_info(${quoteIdent(table.name)})`
      );

      if (!mainCols.length || !remoteCols.length) {
        continue;
      }

      const mainColSet = new Set(mainCols.map((c) => c.name));
      const commonCols = remoteCols.filter((c) => mainColSet.has(c.name));
      const pkCols = commonCols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);

      if (!pkCols.length) {
        const colList = commonCols.map((c) => quoteIdent(c.name)).join(", ");
        db.exec(
          `INSERT OR IGNORE INTO main.${quoteIdent(table.name)} (${colList}) SELECT ${colList} FROM remote.${quoteIdent(table.name)}`
        );
        continue;
      }

      const nonPkCols = commonCols.filter((c) => c.pk === 0).map((c) => c.name);
      const hasUpdatedAt = commonCols.some((c) => c.name === "updated_at");
      const colList = commonCols.map((c) => quoteIdent(c.name)).join(", ");
      const pkList = pkCols.map(quoteIdent).join(", ");
      const updateCols = nonPkCols.filter((c) => c !== "updated_at");

      if (hasUpdatedAt && (updateCols.length > 0 || nonPkCols.length > 0)) {
        const updateAssignments = updateCols
          .map(
            (c) =>
              `${quoteIdent(c)} = CASE WHEN COALESCE(excluded.${quoteIdent("updated_at")}, 0) >= COALESCE(main.${quoteIdent(table.name)}.${quoteIdent("updated_at")}, 0) THEN excluded.${quoteIdent(c)} ELSE main.${quoteIdent(table.name)}.${quoteIdent(c)} END`
          )
          .join(", ");

        const setClause =
          updateAssignments.length > 0
            ? `${updateAssignments}, ${quoteIdent("updated_at")} = MAX(COALESCE(main.${quoteIdent(table.name)}.${quoteIdent("updated_at")}, 0), COALESCE(excluded.${quoteIdent("updated_at")}, 0))`
            : `${quoteIdent("updated_at")} = MAX(COALESCE(main.${quoteIdent(table.name)}.${quoteIdent("updated_at")}, 0), COALESCE(excluded.${quoteIdent("updated_at")}, 0))`;

        db.exec(`
          INSERT INTO main.${quoteIdent(table.name)} (${colList})
          SELECT ${colList} FROM remote.${quoteIdent(table.name)}
          WHERE true
          ON CONFLICT(${pkList}) DO UPDATE SET
            ${setClause}
        `);
      } else {
        db.exec(`
          INSERT INTO main.${quoteIdent(table.name)} (${colList})
          SELECT ${colList} FROM remote.${quoteIdent(table.name)}
          WHERE true
          ON CONFLICT(${pkList}) DO NOTHING
        `);
      }
    }

    db.exec("COMMIT;");
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      // Ignore rollback failure if transaction was not active
    }
    throw err;
  }
};
