"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "./auth-client";

type DocumentItem = {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  uploadedBy: { id: string; name: string; email: string };
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  if (Array.isArray(body?.message)) return body.message.join(" ");
  return body?.message || fallback;
}

export default function DocumentsPanel() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch("/documents/admin");
      if (!response.ok)
        throw new Error(
          await responseError(
            response,
            "Não foi possível carregar os documentos.",
          ),
        );
      setDocuments((await response.json()) as DocumentItem[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Erro inesperado.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setError("");
    setSuccess("");
    const body = new FormData();
    body.append("file", file);
    if (name.trim()) body.append("name", name.trim());
    try {
      const response = await authenticatedFetch("/documents", {
        method: "POST",
        body,
      });
      if (!response.ok)
        throw new Error(await responseError(response, "Falha no upload."));
      setName("");
      setFile(null);
      formRef.current?.reset();
      setSuccess("Documento publicado e disponível para o aplicativo.");
      await loadDocuments();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Falha no upload.",
      );
    } finally {
      setUploading(false);
    }
  };

  const replace = async (document: DocumentItem, replacement?: File) => {
    if (!replacement) return;
    setBusyId(document.id);
    setError("");
    setSuccess("");
    const body = new FormData();
    body.append("file", replacement);
    try {
      const response = await authenticatedFetch(
        `/documents/${document.id}/file`,
        {
          method: "PUT",
          body,
        },
      );
      if (!response.ok)
        throw new Error(
          await responseError(response, "Falha ao substituir o arquivo."),
        );
      setSuccess(
        `${document.name} foi atualizado para a versão ${document.version + 1}.`,
      );
      await loadDocuments();
    } catch (replaceError) {
      setError(
        replaceError instanceof Error
          ? replaceError.message
          : "Falha ao substituir o arquivo.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = async (document: DocumentItem) => {
    setBusyId(document.id);
    setError("");
    setSuccess("");
    try {
      const response = await authenticatedFetch(
        `/documents/${document.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !document.isActive }),
        },
      );
      if (!response.ok)
        throw new Error(
          await responseError(response, "Falha ao alterar o documento."),
        );
      setSuccess(
        document.isActive
          ? "Documento desativado."
          : "Documento publicado novamente.",
      );
      await loadDocuments();
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Falha ao alterar o documento.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const download = async (document: DocumentItem) => {
    setBusyId(document.id);
    setError("");
    try {
      const response = await authenticatedFetch(
        `/documents/${document.id}/download`,
      );
      if (!response.ok)
        throw new Error(
          await responseError(response, "Falha ao preparar o download."),
        );
      const { url } = (await response.json()) as { url: string };
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.rel = "noopener";
      anchor.click();
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Falha no download.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="documents-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Biblioteca offline</p>
          <h1>Documentos</h1>
          <p>
            Publique orientações e arquivos para consulta das equipes em campo.
          </p>
        </div>
        <span className="document-count">
          {documents.filter((item) => item.isActive).length} ativos
        </span>
      </div>

      <section className="document-upload-card">
        <div>
          <p className="eyebrow">Novo arquivo</p>
          <h2>Publicar documento</h2>
          <p>PDF, Word, Excel, PowerPoint, texto ou imagem, com até 30 MB.</p>
        </div>
        <form ref={formRef} className="upload-form" onSubmit={upload}>
          <label>
            <span>Nome para exibição</span>
            <input
              value={name}
              maxLength={160}
              onChange={(event) => setName(event.target.value)}
              placeholder="Opcional — usaremos o nome do arquivo"
            />
          </label>
          <label className="file-field">
            <span>Arquivo</span>
            <input
              type="file"
              required
              accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button disabled={!file || uploading}>
            {uploading ? "Enviando…" : "Publicar"}
          </button>
        </form>
      </section>

      {error && <p className="feedback error">{error}</p>}
      {success && <p className="feedback success">{success}</p>}

      <section className="documents-card">
        <div className="documents-heading">
          <div>
            <h2>Arquivos publicados</h2>
            <p>
              {documents.length} documento{documents.length === 1 ? "" : "s"}{" "}
              cadastrado{documents.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {loading ? (
          <div className="state-message">
            <span className="spinner" /> Carregando documentos…
          </div>
        ) : documents.length === 0 ? (
          <div className="state-message">
            <strong>Nenhum documento publicado.</strong>
            <span>
              Use o formulário acima para disponibilizar o primeiro arquivo.
            </span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Versão</th>
                  <th>Tamanho</th>
                  <th>Atualizado em</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td>
                      <strong>{document.name}</strong>
                      <span>
                        {document.originalName} · por {document.uploadedBy.name}
                      </span>
                    </td>
                    <td>v{document.version}</td>
                    <td>{formatSize(document.sizeBytes)}</td>
                    <td>{formatDate(document.updatedAt)}</td>
                    <td>
                      <span
                        className={
                          document.isActive
                            ? "status-badge active"
                            : "status-badge"
                        }
                      >
                        {document.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      <div className="document-actions">
                        <button
                          className="button-secondary compact"
                          disabled={busyId === document.id}
                          onClick={() => void download(document)}
                        >
                          Baixar
                        </button>
                        <label
                          className={`button-secondary compact file-action ${busyId === document.id ? "disabled" : ""}`}
                        >
                          Substituir
                          <input
                            type="file"
                            disabled={busyId === document.id}
                            accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                            onChange={(event) => {
                              void replace(document, event.target.files?.[0]);
                              event.target.value = "";
                            }}
                          />
                        </label>
                        <button
                          className="button-quiet compact"
                          disabled={busyId === document.id}
                          onClick={() => void setStatus(document)}
                        >
                          {document.isActive ? "Desativar" : "Ativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
