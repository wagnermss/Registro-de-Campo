import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('registro-campo.db');

export type LocalRecord = { id: string; title: string; description: string | null; latitude: number; longitude: number; photoUri: string | null; capturedAt: string; syncStatus: 'PENDING' | 'SYNCED' };

export async function initializeDatabase() {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS field_records (
    id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, description TEXT,
    latitude REAL NOT NULL, longitude REAL NOT NULL, photo_uri TEXT,
    captured_at TEXT NOT NULL, sync_status TEXT NOT NULL DEFAULT 'PENDING'
  );`);
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(field_records)');
  const names = new Set(columns.map((column) => column.name));
  if (!names.has('description')) await db.execAsync('ALTER TABLE field_records ADD COLUMN description TEXT');
  if (!names.has('photo_uri')) await db.execAsync('ALTER TABLE field_records ADD COLUMN photo_uri TEXT');
  if (!names.has('sync_status')) await db.execAsync("ALTER TABLE field_records ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'PENDING'");
}

export async function listRecords() {
  return db.getAllAsync<LocalRecord>('SELECT id, title, description, latitude, longitude, photo_uri as photoUri, captured_at as capturedAt, sync_status as syncStatus FROM field_records ORDER BY captured_at DESC');
}

export async function saveRecord(record: LocalRecord) {
  await db.runAsync('INSERT INTO field_records (id, title, description, latitude, longitude, photo_uri, captured_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', record.id, record.title, record.description, record.latitude, record.longitude, record.photoUri, record.capturedAt, record.syncStatus);
}

export const initializeLocalDatabase = initializeDatabase;
export const listLocalRecords = listRecords;

export async function createLocalRecord(record: Omit<LocalRecord, 'description' | 'syncStatus' | 'latitude' | 'longitude'> & { latitude: number | null; longitude: number | null }) {
  if (record.latitude === null || record.longitude === null) {
    throw new Error('A localização é obrigatória para criar um registro.');
  }
  return saveRecord({ ...record, latitude: record.latitude, longitude: record.longitude, description: null, syncStatus: 'PENDING' });
}
