import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { authenticatedFetch } from "./auth-session";
import {
  applyDocumentCatalog,
  listLocalDocuments,
  LocalDocument,
  markDocumentDownloaded,
} from "./local-db";

type ServerDocument = Omit<
  LocalDocument,
  "localUri" | "downloadedChecksum" | "downloadedVersion"
>;

export async function syncDocumentCatalog() {
  const response = await authenticatedFetch("/documents");
  if (!response.ok)
    throw new Error(`Falha ao atualizar documentos (${response.status})`);
  const documents = (await response.json()) as ServerDocument[];
  const removedUris = await applyDocumentCatalog(documents);
  for (const uri of removedUris)
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(
      () => undefined,
    );
  return documents.length;
}

export async function downloadDocument(document: LocalDocument) {
  if (!FileSystem.documentDirectory)
    throw new Error("O armazenamento local não está disponível.");
  const directory = `${FileSystem.documentDirectory}offline-documents/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const extension =
    document.originalName
      .split(".")
      .pop()
      ?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
  const destination = `${directory}${document.id}-v${document.version}.${extension}`;
  const linkResponse = await authenticatedFetch(
    `/documents/${document.id}/download`,
  );
  if (!linkResponse.ok)
    throw new Error(`Falha ao preparar o download (${linkResponse.status})`);
  const link = (await linkResponse.json()) as {
    url: string;
    checksumSha256: string;
    version: number;
  };
  await FileSystem.deleteAsync(destination, { idempotent: true });
  const downloaded = await FileSystem.downloadAsync(link.url, destination);
  if (downloaded.status !== 200)
    throw new Error(`Falha no download (${downloaded.status})`);
  if (document.localUri && document.localUri !== destination)
    await FileSystem.deleteAsync(document.localUri, { idempotent: true }).catch(
      () => undefined,
    );
  await markDocumentDownloaded(
    document.id,
    downloaded.uri,
    link.checksumSha256,
    link.version,
  );
  return listLocalDocuments();
}

export async function openOfflineDocument(document: LocalDocument) {
  if (!document.localUri)
    throw new Error("Baixe o documento antes de abri-lo.");
  const info = await FileSystem.getInfoAsync(document.localUri);
  if (!info.exists)
    throw new Error("O arquivo local não foi encontrado. Baixe-o novamente.");
  if (!(await Sharing.isAvailableAsync()))
    throw new Error(
      "A visualização de arquivos não está disponível neste aparelho.",
    );
  await Sharing.shareAsync(document.localUri, {
    dialogTitle: document.name,
    mimeType: document.mimeType,
  });
}
