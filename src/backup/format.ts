import type { Db } from "../db/index.ts";
import { DB_VERSION } from "../db/migrations.ts";
import { countRecords, loadRecords, totalOf, type Records } from "./records.ts";

export const BACKUP_APP = "jamat";
/** Version of the file layout (not the database schema). Bump only for incompatible layout changes. */
export const BACKUP_FORMAT = 1;
export const MAX_BACKUP_CHARS = 25_000_000;
export const MAX_RECORDS = 200_000;

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  /** Database schema version the data was exported from. */
  schemaVersion: number;
  exportedAt: number;
  data: Records;
}

export interface Export {
  text: string;
  filename: string;
  recordCount: number;
  /** Stored records that were invalid and therefore not exported. */
  skipped: number;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function backupFilename(now: number): string {
  const d = new Date(now);
  return `jamat-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

export function serializeBackup(records: Records, now: number): string {
  const file: BackupFile = { app: BACKUP_APP, format: BACKUP_FORMAT, schemaVersion: DB_VERSION, exportedAt: now, data: records };
  return JSON.stringify(file, null, 2);
}

/** Complete export of the supported data. */
export async function exportBackup(db: Db, now: number = Date.now()): Promise<Export> {
  const { records, malformed } = await loadRecords(db);
  return {
    text: serializeBackup(records, now),
    filename: backupFilename(now),
    recordCount: totalOf(countRecords(records)),
    skipped: malformed,
  };
}
