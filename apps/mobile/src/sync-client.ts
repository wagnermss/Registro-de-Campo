import { authenticatedFetch } from "./auth-session";
import {
  applyServerChanges,
  getSyncCursor,
  listPendingOperations,
  markOperationConflict,
  markOperationFailed,
  markOperationSynced,
  setPhotoKey,
} from "./local-db";

async function uploadPhoto(photoUri: string) {
  const form = new FormData();
  form.append("file", {
    uri: photoUri,
    name: "record.jpg",
    type: "image/jpeg",
  } as unknown as Blob);
  const response = await authenticatedFetch("/uploads/photos", {
    method: "POST",
    body: form,
  });
  if (!response.ok)
    throw new Error(`Falha no upload da foto (${response.status})`);
  return (await response.json()).storageKey as string;
}

export async function syncPendingRecords() {
  const operations = await listPendingOperations();
  let synced = 0;
  for (const operation of operations) {
    try {
      let photoKey = operation.photoKey;
      if (operation.photoUri && !photoKey) {
        photoKey = await uploadPhoto(operation.photoUri);
        await setPhotoKey(operation.id, photoKey);
      }
      const response = await authenticatedFetch("/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: [
            {
              operationId: operation.operationId,
              recordId: operation.id,
              type: operation.operationType,
              baseVersion: operation.baseVersion,
              payload: {
                id: operation.id,
                title: operation.title,
                description: operation.description,
                latitude: operation.latitude,
                longitude: operation.longitude,
                capturedAt: operation.capturedAt,
                photoKey,
              },
            },
          ],
        }),
      });
      if (!response.ok)
        throw new Error(`Falha na sincronização (${response.status})`);
      const result = (await response.json()).results[0];
      if (result.status === "APPLIED") {
        await markOperationSynced(
          operation.operationId,
          operation.id,
          result.version,
        );
        synced += 1;
      } else
        await markOperationConflict(
          operation.operationId,
          operation.id,
          `Servidor retornou ${result.status}`,
        );
    } catch (error) {
      await markOperationFailed(
        operation.operationId,
        error instanceof Error ? error.message : "Erro desconhecido",
      );
    }
  }
  const cursor = await getSyncCursor();
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const pulled = await authenticatedFetch(`/sync/pull${query}`);
  if (pulled.ok) {
    const changes = await pulled.json();
    await applyServerChanges(changes.records, changes.cursor);
  }
  return { total: operations.length, synced };
}
