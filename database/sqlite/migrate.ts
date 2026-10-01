// Compatible with an exclusive Expo SQLite connection; inject bundled schema SQL.
// Never call while other app queries are running. No credentials are stored here.
export interface SQLiteAdapter {
  execAsync(sql: string): Promise<unknown>;
  getAllAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T[]>;
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<unknown>;
}
const v2Tables = ['local_contexts','local_patients','local_exams','local_exam_versions','sync_queue','sync_metadata','local_file_cleanup','legacy_queue_quarantine'];
const legacyTables = ['local_patients', 'local_exams', 'local_exam_versions', 'sync_queue', 'sync_metadata'];
const quote = (name: string) => '"' + name.replace(/"/g, '""') + '"';
export async function migrateLocalDatabase(db: SQLiteAdapter, schemaSql: string): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys=ON');
  const fk = await db.getAllAsync<{foreign_keys: number}>('PRAGMA foreign_keys');
  if (fk[0]?.foreign_keys !== 1) throw new Error('Foreign keys unavailable');
  const version = (await db.getAllAsync<{user_version: number}>('PRAGMA user_version'))[0].user_version;
  const tables = (await db.getAllAsync<{name: string}>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map(r => r.name);
  if (version === 2) {
    if (!v2Tables.every(t => tables.includes(t)) || tables.some(t => !v2Tables.includes(t) && t !== 'legacy_sync_queue_raw')) throw new Error('Incomplete v2 database');
    return;
  }
  if (![0,1].includes(version) || (tables.length && tables.join() !== [...legacyTables].sort().join())) throw new Error('Unknown database layout');
  await db.execAsync('BEGIN EXCLUSIVE');
  try {
    let rawJson: string | undefined;
    let fileColumn: string | undefined;
    if (tables.length) {
      const cols = await db.getAllAsync<{name: string}>('PRAGMA table_info(sync_queue)');
      rawJson = 'json_object(' + cols.map(({name}) => {
        const c = quote(name);
        return "'" + name.replace(/'/g,"''") + "',json_object('storageType',typeof(" + c + "),'value',CASE WHEN typeof(" + c + ")='blob' THEN hex(" + c + ') ELSE ' + c + ' END)';
      }).join(',') + ')';
      fileColumn = cols.some(c => c.name === 'file_uri') ? 'file_uri' : 'NULL';
      await db.execAsync('ALTER TABLE sync_queue RENAME TO legacy_sync_queue_raw');
      for (const name of ['local_exam_versions','local_exams','local_patients','sync_metadata']) await db.execAsync('DROP TABLE ' + quote(name));
      await db.execAsync('PRAGMA user_version=1');
    }
    // execAsync does not commit implicitly, unlike Python executescript.
    await db.execAsync(schemaSql.replace(/^PRAGMA foreign_keys\s*=\s*ON;\s*$/gmi, ''));
    if (rawJson) await db.execAsync('INSERT INTO legacy_queue_quarantine(legacy_rowid,raw_record,file_uri) SELECT rowid,' + rawJson + ',' + fileColumn + ' FROM legacy_sync_queue_raw');
    if ((await db.getAllAsync('PRAGMA foreign_key_check')).length) throw new Error('Migration foreign key violation');
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}
