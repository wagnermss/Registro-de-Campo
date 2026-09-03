export type UserRole = "ADMIN" | "FIELD_USER";

export type SyncOperationType = "CREATE" | "UPDATE" | "DELETE";

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  capturedAt: string;
}

export interface FieldRecord {
  id: string;
  userId: string;
  title: string;
  description?: string;
  location: GeoLocation;
  photoUrl?: string;
  version: number;
  updatedAt: string;
  deletedAt?: string;
}

export interface SyncOperation {
  operationId: string;
  recordId: string;
  type: SyncOperationType;
  baseVersion: number;
  updatedAt: string;
  payload?: Partial<FieldRecord>;
}

export interface SyncConflict {
  operationId: string;
  recordId: string;
  reason: "VERSION_MISMATCH" | "RECORD_DELETED";
  serverRecord?: FieldRecord;
}

export interface DocumentMetadata {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  version: number;
  updatedAt: string;
}
