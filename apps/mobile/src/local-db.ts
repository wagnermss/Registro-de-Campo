import { randomUUID } from "expo-crypto";
import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("registro-campo.db");

export type LocalRecord = {
  id: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  photoUri: string | null;
  photoKey: string | null;
  capturedAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
  syncStatus: "PENDING" | "SYNCED" | "CONFLICT";
};

export type PendingOperation = LocalRecord & {
  operationId: string;
  operationType: "CREATE" | "UPDATE" | "DELETE";
  baseVersion: number;
  attempts: number;
};

export async function initializeLocalDatabase() {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS field_records (
      id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, description TEXT,
      latitude REAL NOT NULL, longitude REAL NOT NULL, photo_uri TEXT, photo_key TEXT,
      captured_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, version INTEGER NOT NULL DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'PENDING'
    );
  `);
  const columns = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(field_records)",
  );
  const names = new Set(columns.map(({ name }) => name));
  if (!names.has("description"))
    await db.execAsync("ALTER TABLE field_records ADD COLUMN description TEXT");
  if (!names.has("photo_uri"))
    await db.execAsync("ALTER TABLE field_records ADD COLUMN photo_uri TEXT");
  if (!names.has("photo_key"))
    await db.execAsync("ALTER TABLE field_records ADD COLUMN photo_key TEXT");
  if (!names.has("sync_status"))
    await db.execAsync(
      "ALTER TABLE field_records ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'PENDING'",
    );
  if (!names.has("version"))
    await db.execAsync(
      "ALTER TABLE field_records ADD COLUMN version INTEGER NOT NULL DEFAULT 0",
    );
  if (!names.has("updated_at")) {
    await db.execAsync("ALTER TABLE field_records ADD COLUMN updated_at TEXT");
    await db.execAsync(
      "UPDATE field_records SET updated_at = captured_at WHERE updated_at IS NULL",
    );
  }
  if (!names.has("deleted_at"))
    await db.execAsync("ALTER TABLE field_records ADD COLUMN deleted_at TEXT");

  const oldIds = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM field_records",
  );
  for (const row of oldIds) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        row.id,
      )
    ) {
      await db.runAsync(
        "UPDATE field_records SET id = ? WHERE id = ?",
        randomUUID(),
        row.id,
      );
    }
  }

  await db.execAsync(`CREATE TABLE IF NOT EXISTS sync_queue (
    operation_id TEXT PRIMARY KEY NOT NULL, record_id TEXT NOT NULL UNIQUE,
    operation_type TEXT NOT NULL, base_version INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL,
    FOREIGN KEY (record_id) REFERENCES field_records(id) ON DELETE CASCADE
  );`);
  await db.execAsync(`CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL
  );`);
  const pending = await db.getAllAsync<{
    id: string;
    version: number;
    capturedAt: string;
  }>(
    "SELECT id, version, captured_at as capturedAt FROM field_records WHERE sync_status = 'PENDING' AND id NOT IN (SELECT record_id FROM sync_queue)",
  );
  for (const record of pending) {
    await db.runAsync(
      "INSERT INTO sync_queue (operation_id, record_id, operation_type, base_version, created_at) VALUES (?, ?, 'CREATE', ?, ?)",
      randomUUID(),
      record.id,
      record.version,
      record.capturedAt,
    );
  }
}

export async function listLocalRecords() {
  return db.getAllAsync<LocalRecord>(`SELECT id, title, description, latitude, longitude,
    photo_uri as photoUri, photo_key as photoKey, captured_at as capturedAt,
    updated_at as updatedAt, deleted_at as deletedAt, version, sync_status as syncStatus
    FROM field_records WHERE deleted_at IS NULL ORDER BY captured_at DESC`);
}

export async function createLocalRecord(record: {
  id: string;
  title: string;
  latitude: number | null;
  longitude: number | null;
  photoUri: string | null;
  capturedAt: string;
}) {
  if (record.latitude === null || record.longitude === null)
    throw new Error("A localização é obrigatória para criar um registro.");
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO field_records
      (id, title, description, latitude, longitude, photo_uri, photo_key, captured_at, updated_at, deleted_at, version, sync_status)
      VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, ?, NULL, 0, 'PENDING')`,
      record.id,
      record.title,
      record.latitude,
      record.longitude,
      record.photoUri,
      record.capturedAt,
      record.capturedAt,
    );
    await db.runAsync(
      "INSERT INTO sync_queue (operation_id, record_id, operation_type, base_version, created_at) VALUES (?, ?, 'CREATE', 0, ?)",
      randomUUID(),
      record.id,
      record.capturedAt,
    );
  });
}

export async function listPendingOperations() {
  return db.getAllAsync<PendingOperation>(`SELECT r.id, r.title, r.description, r.latitude, r.longitude,
    r.photo_uri as photoUri, r.photo_key as photoKey, r.captured_at as capturedAt,
    r.updated_at as updatedAt, r.deleted_at as deletedAt, r.version, r.sync_status as syncStatus,
    q.operation_id as operationId, q.operation_type as operationType,
    q.base_version as baseVersion, q.attempts
    FROM sync_queue q JOIN field_records r ON r.id = q.record_id ORDER BY q.created_at ASC`);
}

export async function setPhotoKey(recordId: string, photoKey: string) {
  await db.runAsync(
    "UPDATE field_records SET photo_key = ? WHERE id = ?",
    photoKey,
    recordId,
  );
}

export async function markOperationSynced(
  operationId: string,
  recordId: string,
  version: number,
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE field_records SET sync_status = 'SYNCED', version = ? WHERE id = ?",
      version,
      recordId,
    );
    await db.runAsync(
      "DELETE FROM sync_queue WHERE operation_id = ?",
      operationId,
    );
  });
}

export async function markOperationConflict(
  operationId: string,
  recordId: string,
  message: string,
) {
  await db.runAsync(
    "UPDATE field_records SET sync_status = 'CONFLICT' WHERE id = ?",
    recordId,
  );
  await db.runAsync(
    "UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE operation_id = ?",
    message,
    operationId,
  );
}

export async function markOperationFailed(
  operationId: string,
  message: string,
) {
  await db.runAsync(
    "UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE operation_id = ?",
    message,
    operationId,
  );
}

export async function getSyncCursor() {
  return (
    await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM sync_state WHERE key = 'records_cursor'",
    )
  )?.value;
}

type ServerRecord = Omit<LocalRecord, "photoUri" | "syncStatus">;

export async function applyServerChanges(
  records: ServerRecord[],
  cursor: string,
) {
  await db.withTransactionAsync(async () => {
    for (const record of records) {
      await db.runAsync(
        `INSERT INTO field_records
        (id, title, description, latitude, longitude, photo_uri, photo_key, captured_at, updated_at, deleted_at, version, sync_status)
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'SYNCED')
        ON CONFLICT(id) DO UPDATE SET
          title = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.title ELSE excluded.title END,
          description = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.description ELSE excluded.description END,
          latitude = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.latitude ELSE excluded.latitude END,
          longitude = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.longitude ELSE excluded.longitude END,
          photo_key = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.photo_key ELSE excluded.photo_key END,
          updated_at = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.updated_at ELSE excluded.updated_at END,
          deleted_at = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.deleted_at ELSE excluded.deleted_at END,
          version = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.version ELSE excluded.version END,
          sync_status = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.sync_status ELSE 'SYNCED' END`,
        record.id,
        record.title,
        record.description,
        record.latitude,
        record.longitude,
        record.photoKey,
        record.capturedAt,
        record.updatedAt,
        record.deletedAt,
        record.version,
      );
    }
    await db.runAsync(
      "INSERT INTO sync_state (key, value) VALUES ('records_cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      cursor,
    );
  });
}
