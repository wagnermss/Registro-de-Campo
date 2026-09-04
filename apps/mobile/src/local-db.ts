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

export type ServerRecord = Omit<LocalRecord, "photoUri" | "syncStatus">;

export type LocalConflict = {
  operationId: string;
  operationType: "CREATE" | "UPDATE" | "DELETE";
  message: string | null;
  localRecord: LocalRecord;
  serverRecord: ServerRecord | null;
};

export type PendingOperation = LocalRecord & {
  operationId: string;
  operationType: "CREATE" | "UPDATE" | "DELETE";
  baseVersion: number;
  attempts: number;
};

export type LocalDocument = {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  version: number;
  updatedAt: string;
  localUri: string | null;
  downloadedChecksum: string | null;
  downloadedVersion: number | null;
};

export async function initializeLocalDatabase() {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS field_records (
      id TEXT PRIMARY KEY NOT NULL, owner_user_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT,
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
  if (!names.has("owner_user_id"))
    await db.execAsync(
      "ALTER TABLE field_records ADD COLUMN owner_user_id TEXT",
    );

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
    attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, server_payload TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (record_id) REFERENCES field_records(id) ON DELETE CASCADE
  );`);
  const queueColumns = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(sync_queue)",
  );
  if (!queueColumns.some(({ name }) => name === "server_payload"))
    await db.execAsync("ALTER TABLE sync_queue ADD COLUMN server_payload TEXT");
  await db.execAsync(`CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL
  );`);
  await db.execAsync(`CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, checksum_sha256 TEXT NOT NULL,
    version INTEGER NOT NULL, updated_at TEXT NOT NULL, local_uri TEXT,
    downloaded_checksum TEXT, downloaded_version INTEGER
  );`);
}

export async function prepareLocalDataForUser(
  userId: string,
  claimLegacyPending = false,
) {
  await db.withTransactionAsync(async () => {
    if (claimLegacyPending)
      await db.runAsync(
        `UPDATE field_records SET owner_user_id = ?
         WHERE owner_user_id IS NULL AND sync_status IN ('PENDING', 'CONFLICT')`,
        userId,
      );
  });

  const pending = await db.getAllAsync<{
    id: string;
    version: number;
    capturedAt: string;
  }>(
    `SELECT id, version, captured_at as capturedAt FROM field_records
     WHERE owner_user_id = ? AND sync_status = 'PENDING'
       AND id NOT IN (SELECT record_id FROM sync_queue)`,
    userId,
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

export async function listLocalDocuments() {
  return db.getAllAsync<LocalDocument>(`SELECT id, name, original_name as originalName,
    mime_type as mimeType, size_bytes as sizeBytes, checksum_sha256 as checksumSha256,
    version, updated_at as updatedAt, local_uri as localUri,
    downloaded_checksum as downloadedChecksum, downloaded_version as downloadedVersion
    FROM documents ORDER BY updated_at DESC`);
}

export async function applyDocumentCatalog(
  documents: Omit<
    LocalDocument,
    "localUri" | "downloadedChecksum" | "downloadedVersion"
  >[],
) {
  const existing = await listLocalDocuments();
  const activeIds = new Set(documents.map(({ id }) => id));
  const removedUris = existing
    .filter(({ id, localUri }) => !activeIds.has(id) && localUri)
    .map(({ localUri }) => localUri as string);
  await db.withTransactionAsync(async () => {
    for (const document of documents) {
      await db.runAsync(
        `INSERT INTO documents
        (id, name, original_name, mime_type, size_bytes, checksum_sha256, version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name,
          original_name = excluded.original_name, mime_type = excluded.mime_type,
          size_bytes = excluded.size_bytes, checksum_sha256 = excluded.checksum_sha256,
          version = excluded.version, updated_at = excluded.updated_at`,
        document.id,
        document.name,
        document.originalName,
        document.mimeType,
        document.sizeBytes,
        document.checksumSha256,
        document.version,
        document.updatedAt,
      );
    }
    for (const existingDocument of existing) {
      if (!activeIds.has(existingDocument.id))
        await db.runAsync(
          "DELETE FROM documents WHERE id = ?",
          existingDocument.id,
        );
    }
  });
  return removedUris;
}

export async function markDocumentDownloaded(
  id: string,
  localUri: string,
  checksum: string,
  version: number,
) {
  await db.runAsync(
    `UPDATE documents SET local_uri = ?, downloaded_checksum = ?, downloaded_version = ?
     WHERE id = ?`,
    localUri,
    checksum,
    version,
    id,
  );
}

export async function listLocalRecords(userId: string) {
  return db.getAllAsync<LocalRecord>(
    `SELECT id, title, description, latitude, longitude,
    photo_uri as photoUri, photo_key as photoKey, captured_at as capturedAt,
    updated_at as updatedAt, deleted_at as deletedAt, version, sync_status as syncStatus
    FROM field_records WHERE owner_user_id = ? AND deleted_at IS NULL
    ORDER BY captured_at DESC`,
    userId,
  );
}

export async function createLocalRecord(
  record: {
    id: string;
    title: string;
    description: string | null;
    latitude: number | null;
    longitude: number | null;
    photoUri: string | null;
    capturedAt: string;
  },
  userId: string,
) {
  if (record.latitude === null || record.longitude === null)
    throw new Error("A localização é obrigatória para criar um registro.");
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO field_records
      (id, owner_user_id, title, description, latitude, longitude, photo_uri, photo_key, captured_at, updated_at, deleted_at, version, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, 0, 'PENDING')`,
      record.id,
      userId,
      record.title,
      record.description,
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

export async function updateLocalRecord(
  userId: string,
  id: string,
  title: string,
  description: string | null,
) {
  const record = await db.getFirstAsync<LocalRecord>(
    `SELECT id, title, description, latitude, longitude, photo_uri as photoUri,
     photo_key as photoKey, captured_at as capturedAt, updated_at as updatedAt,
     deleted_at as deletedAt, version, sync_status as syncStatus
     FROM field_records WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`,
    id,
    userId,
  );
  if (!record) throw new Error("Registro local não encontrado.");
  if (record.syncStatus === "CONFLICT")
    throw new Error("Resolva o conflito antes de editar este registro.");
  const queued = await db.getFirstAsync<{ operationType: string }>(
    "SELECT operation_type as operationType FROM sync_queue WHERE record_id = ?",
    id,
  );
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE field_records SET title = ?, description = ?, updated_at = ?, sync_status = 'PENDING'
       WHERE id = ? AND owner_user_id = ?`,
      title,
      description,
      now,
      id,
      userId,
    );
    if (!queued)
      await db.runAsync(
        `INSERT INTO sync_queue
         (operation_id, record_id, operation_type, base_version, created_at)
         VALUES (?, ?, 'UPDATE', ?, ?)`,
        randomUUID(),
        id,
        record.version,
        now,
      );
  });
}

export async function deleteLocalRecord(userId: string, id: string) {
  const record = await db.getFirstAsync<LocalRecord>(
    `SELECT id, title, description, latitude, longitude, photo_uri as photoUri,
     photo_key as photoKey, captured_at as capturedAt, updated_at as updatedAt,
     deleted_at as deletedAt, version, sync_status as syncStatus
     FROM field_records WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`,
    id,
    userId,
  );
  if (!record) throw new Error("Registro local não encontrado.");
  if (record.syncStatus === "CONFLICT")
    throw new Error("Resolva o conflito antes de excluir este registro.");
  const queued = await db.getFirstAsync<{ operationType: string }>(
    "SELECT operation_type as operationType FROM sync_queue WHERE record_id = ?",
    id,
  );
  if (queued?.operationType === "CREATE") {
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM sync_queue WHERE record_id = ?", id);
      await db.runAsync(
        "DELETE FROM field_records WHERE id = ? AND owner_user_id = ?",
        id,
        userId,
      );
    });
    return record.photoUri;
  }
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE field_records SET deleted_at = ?, updated_at = ?, sync_status = 'PENDING'
       WHERE id = ? AND owner_user_id = ?`,
      now,
      now,
      id,
      userId,
    );
    if (queued)
      await db.runAsync(
        "UPDATE sync_queue SET operation_type = 'DELETE' WHERE record_id = ?",
        id,
      );
    else
      await db.runAsync(
        `INSERT INTO sync_queue
         (operation_id, record_id, operation_type, base_version, created_at)
         VALUES (?, ?, 'DELETE', ?, ?)`,
        randomUUID(),
        id,
        record.version,
        now,
      );
  });
  return null;
}

export async function listPendingOperations(userId: string) {
  return db.getAllAsync<PendingOperation>(
    `SELECT r.id, r.title, r.description, r.latitude, r.longitude,
    r.photo_uri as photoUri, r.photo_key as photoKey, r.captured_at as capturedAt,
    r.updated_at as updatedAt, r.deleted_at as deletedAt, r.version, r.sync_status as syncStatus,
    q.operation_id as operationId, q.operation_type as operationType,
    q.base_version as baseVersion, q.attempts
    FROM sync_queue q JOIN field_records r ON r.id = q.record_id
    WHERE r.owner_user_id = ? ORDER BY q.created_at ASC`,
    userId,
  );
}

export async function setPhotoKey(
  userId: string,
  recordId: string,
  photoKey: string,
) {
  await db.runAsync(
    "UPDATE field_records SET photo_key = ? WHERE id = ? AND owner_user_id = ?",
    photoKey,
    recordId,
    userId,
  );
}

export async function markOperationSynced(
  userId: string,
  operationId: string,
  recordId: string,
  version: number,
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE field_records SET sync_status = 'SYNCED', version = ? WHERE id = ? AND owner_user_id = ?",
      version,
      recordId,
      userId,
    );
    await db.runAsync(
      "DELETE FROM sync_queue WHERE operation_id = ? AND record_id = ?",
      operationId,
      recordId,
    );
  });
}

export async function markOperationConflict(
  userId: string,
  operationId: string,
  recordId: string,
  message: string,
  serverRecord?: ServerRecord,
) {
  await db.runAsync(
    "UPDATE field_records SET sync_status = 'CONFLICT' WHERE id = ? AND owner_user_id = ?",
    recordId,
    userId,
  );
  await db.runAsync(
    `UPDATE sync_queue SET attempts = attempts + 1, last_error = ?, server_payload = ?
     WHERE operation_id = ?`,
    message,
    serverRecord ? JSON.stringify(serverRecord) : null,
    operationId,
  );
}

export async function listLocalConflicts(userId: string) {
  const rows = await db.getAllAsync<
    LocalRecord & {
      operationId: string;
      operationType: "CREATE" | "UPDATE" | "DELETE";
      message: string | null;
      serverPayload: string | null;
    }
  >(
    `SELECT r.id, r.title, r.description, r.latitude, r.longitude,
    r.photo_uri as photoUri, r.photo_key as photoKey, r.captured_at as capturedAt,
    r.updated_at as updatedAt, r.deleted_at as deletedAt, r.version,
    r.sync_status as syncStatus, q.operation_id as operationId,
    q.operation_type as operationType, q.last_error as message,
    q.server_payload as serverPayload
    FROM sync_queue q JOIN field_records r ON r.id = q.record_id
    WHERE r.owner_user_id = ? AND r.sync_status = 'CONFLICT'
    ORDER BY q.created_at ASC`,
    userId,
  );
  return rows.map(
    ({
      operationId,
      operationType,
      message,
      serverPayload,
      ...localRecord
    }) => ({
      operationId,
      operationType,
      message,
      localRecord,
      serverRecord: serverPayload
        ? (JSON.parse(serverPayload) as ServerRecord)
        : null,
    }),
  );
}

export async function acceptServerConflict(
  userId: string,
  conflict: LocalConflict,
) {
  if (!conflict.serverRecord)
    throw new Error("Sincronize novamente para obter a versão do servidor.");
  const server = conflict.serverRecord;
  const discardPhoto =
    conflict.localRecord.photoUri &&
    conflict.localRecord.photoKey !== server.photoKey
      ? conflict.localRecord.photoUri
      : null;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE field_records SET title = ?, description = ?, latitude = ?, longitude = ?,
       photo_uri = CASE WHEN photo_key = ? THEN photo_uri ELSE NULL END,
       photo_key = ?, captured_at = ?, updated_at = ?, deleted_at = ?, version = ?,
       sync_status = 'SYNCED' WHERE id = ? AND owner_user_id = ?`,
      server.title,
      server.description,
      server.latitude,
      server.longitude,
      server.photoKey,
      server.photoKey,
      server.capturedAt,
      server.updatedAt,
      server.deletedAt,
      server.version,
      server.id,
      userId,
    );
    await db.runAsync(
      "DELETE FROM sync_queue WHERE operation_id = ?",
      conflict.operationId,
    );
  });
  return discardPhoto;
}

export async function keepLocalConflict(
  userId: string,
  conflict: LocalConflict,
) {
  if (!conflict.serverRecord)
    throw new Error("Sincronize novamente para obter a versão do servidor.");
  const server = conflict.serverRecord;
  const operationId = randomUUID();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE sync_queue SET operation_id = ?, base_version = ?, attempts = 0,
       last_error = NULL, server_payload = NULL, created_at = ?
       WHERE operation_id = ?`,
      operationId,
      server.version,
      now,
      conflict.operationId,
    );
    await db.runAsync(
      `UPDATE field_records SET version = ?, updated_at = ?, sync_status = 'PENDING'
       WHERE id = ? AND owner_user_id = ?`,
      server.version,
      now,
      conflict.localRecord.id,
      userId,
    );
  });
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

export async function getSyncCursor(userId: string) {
  return (
    await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM sync_state WHERE key = ?",
      `records_cursor:${userId}`,
    )
  )?.value;
}

export async function applyServerChanges(
  userId: string,
  records: ServerRecord[],
  cursor: string,
) {
  await db.withTransactionAsync(async () => {
    for (const record of records) {
      await db.runAsync(
        `INSERT INTO field_records
        (id, owner_user_id, title, description, latitude, longitude, photo_uri, photo_key, captured_at, updated_at, deleted_at, version, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'SYNCED')
        ON CONFLICT(id) DO UPDATE SET
          owner_user_id = CASE WHEN field_records.owner_user_id IS NULL AND field_records.sync_status = 'SYNCED' THEN excluded.owner_user_id ELSE field_records.owner_user_id END,
          title = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.title ELSE excluded.title END,
          description = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.description ELSE excluded.description END,
          latitude = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.latitude ELSE excluded.latitude END,
          longitude = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.longitude ELSE excluded.longitude END,
          photo_key = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.photo_key ELSE excluded.photo_key END,
          updated_at = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.updated_at ELSE excluded.updated_at END,
          deleted_at = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.deleted_at ELSE excluded.deleted_at END,
          version = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.version ELSE excluded.version END,
          sync_status = CASE WHEN field_records.sync_status IN ('PENDING', 'CONFLICT') THEN field_records.sync_status ELSE 'SYNCED' END
        WHERE field_records.owner_user_id = excluded.owner_user_id
           OR (field_records.owner_user_id IS NULL AND field_records.sync_status = 'SYNCED')`,
        record.id,
        userId,
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
      "INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      `records_cursor:${userId}`,
      cursor,
    );
  });
}
