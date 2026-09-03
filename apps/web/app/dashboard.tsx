"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useState } from "react";
import { authenticatedFetch } from "./auth-client";
import DocumentsPanel from "./documents-panel";

const RecordMap = dynamic(() => import("./record-map"), {
  ssr: false,
  loading: () => <div className="map-placeholder">Carregando mapa…</div>,
});

type Profile = { name: string; email: string; role: string };

type FieldRecord = {
  id: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
  photoUrl: string | null;
  version: number;
  user: { id: string; name: string; email: string };
};

type RecordsResponse = {
  items: FieldRecord[];
  page: number;
  pages: number;
  total: number;
  summary: { total: number; withPhoto: number; capturedToday: number };
};

type DashboardProps = { profile: Profile; onLogout: () => Promise<void> };

const emptyResponse: RecordsResponse = {
  items: [],
  page: 1,
  pages: 1,
  total: 0,
  summary: { total: 0, withPhoto: 0, capturedToday: 0 },
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

export default function Dashboard({ profile, onLogout }: DashboardProps) {
  const [view, setView] = useState<"records" | "documents">("records");
  const [data, setData] = useState<RecordsResponse>(emptyResponse);
  const [selected, setSelected] = useState<FieldRecord | null>(null);
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "10",
      });
      if (search) params.set("search", search);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      try {
        const response = await authenticatedFetch(`/records?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error("Não foi possível carregar os registros.");
        const nextData = (await response.json()) as RecordsResponse;
        setData(nextData);
        setSelected((current) => {
          if (current) {
            const updated = nextData.items.find(
              (item) => item.id === current.id,
            );
            if (updated) return updated;
          }
          return nextData.items[0] ?? null;
        });
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        )
          return;
        setError(
          loadError instanceof Error ? loadError.message : "Erro inesperado.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [page, search, from, to]);

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
    setFrom(draftFrom);
    setTo(draftTo);
  };

  if (profile.role !== "ADMIN") {
    return (
      <main className="centered-shell">
        <section className="access-card">
          <span className="brand-mark">RC</span>
          <p className="eyebrow">Acesso restrito</p>
          <h1>Dashboard administrativo</h1>
          <p>
            Esta conta não tem permissão para visualizar os registros enviados.
          </p>
          <button onClick={() => void onLogout()}>Sair</button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">RC</span>
          <div>
            <strong>Registro de Campo</strong>
            <span>Painel operacional</span>
          </div>
        </div>
        <div className="account">
          <div>
            <strong>{profile.name}</strong>
            <span>{profile.email}</span>
          </div>
          <button className="button-secondary" onClick={() => void onLogout()}>
            Sair
          </button>
        </div>
      </header>

      <main className="dashboard">
        <nav className="section-nav" aria-label="Seções do painel">
          <button
            className={view === "records" ? "active" : undefined}
            onClick={() => setView("records")}
          >
            Registros
          </button>
          <button
            className={view === "documents" ? "active" : undefined}
            onClick={() => setView("documents")}
          >
            Documentos
          </button>
        </nav>

        {view === "documents" ? (
          <DocumentsPanel />
        ) : (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">Visão geral</p>
                <h1>Registros recebidos</h1>
                <p>
                  Acompanhe os dados sincronizados pelos dispositivos em campo.
                </p>
              </div>
              <span className="online-status">
                <i /> API conectada
              </span>
            </div>

            <section className="metric-grid" aria-label="Resumo dos registros">
              <article className="metric-card metric-primary">
                <span>Total encontrado</span>
                <strong>{data.summary.total}</strong>
                <small>registros no filtro atual</small>
              </article>
              <article className="metric-card">
                <span>Com evidência</span>
                <strong>{data.summary.withPhoto}</strong>
                <small>registros com fotografia</small>
              </article>
              <article className="metric-card">
                <span>Capturados hoje</span>
                <strong>{data.summary.capturedToday}</strong>
                <small>desde 00:00</small>
              </article>
            </section>

            <section className="records-card">
              <div className="section-heading">
                <div>
                  <h2>Registros de campo</h2>
                  <p>
                    {data.total} resultado{data.total === 1 ? "" : "s"}
                  </p>
                </div>
                <form className="filters" onSubmit={applyFilters}>
                  <label className="search-field">
                    <span>Buscar</span>
                    <input
                      value={draftSearch}
                      onChange={(event) => setDraftSearch(event.target.value)}
                      placeholder="Título, nome ou e-mail"
                    />
                  </label>
                  <label>
                    <span>De</span>
                    <input
                      type="date"
                      value={draftFrom}
                      onChange={(event) => setDraftFrom(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Até</span>
                    <input
                      type="date"
                      value={draftTo}
                      onChange={(event) => setDraftTo(event.target.value)}
                    />
                  </label>
                  <button type="submit">Filtrar</button>
                </form>
              </div>

              {error ? (
                <div className="state-message state-error">
                  <strong>Não conseguimos carregar os dados.</strong>
                  <span>{error}</span>
                </div>
              ) : loading ? (
                <div className="state-message">
                  <span className="spinner" /> Carregando registros…
                </div>
              ) : data.items.length === 0 ? (
                <div className="state-message">
                  <strong>Nenhum registro encontrado.</strong>
                  <span>Sincronize o aplicativo ou altere os filtros.</span>
                </div>
              ) : (
                <div className="records-layout">
                  <div className="table-panel">
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Registro</th>
                            <th>Responsável</th>
                            <th>Capturado em</th>
                            <th>Foto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.items.map((record) => (
                            <tr
                              key={record.id}
                              className={
                                selected?.id === record.id
                                  ? "selected-row"
                                  : undefined
                              }
                            >
                              <td>
                                <button
                                  className="record-link"
                                  onClick={() => setSelected(record)}
                                >
                                  <strong>{record.title}</strong>
                                  <span>
                                    {record.latitude.toFixed(5)},{" "}
                                    {record.longitude.toFixed(5)}
                                  </span>
                                </button>
                              </td>
                              <td>
                                <strong>{record.user.name}</strong>
                                <span>{record.user.email}</span>
                              </td>
                              <td>{formatDate(record.capturedAt)}</td>
                              <td>
                                <span
                                  className={
                                    record.photoUrl
                                      ? "photo-badge yes"
                                      : "photo-badge"
                                  }
                                >
                                  {record.photoUrl ? "Sim" : "Não"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="pagination">
                      <span>
                        Página {data.page} de {data.pages}
                      </span>
                      <div>
                        <button
                          className="button-secondary"
                          disabled={page <= 1}
                          onClick={() => setPage((value) => value - 1)}
                        >
                          Anterior
                        </button>
                        <button
                          className="button-secondary"
                          disabled={page >= data.pages}
                          onClick={() => setPage((value) => value + 1)}
                        >
                          Próxima
                        </button>
                      </div>
                    </div>
                  </div>

                  {selected && (
                    <aside className="detail-panel">
                      {selected.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={selected.photoUrl}
                          alt={`Foto do registro ${selected.title}`}
                        />
                      ) : (
                        <div className="photo-placeholder">Sem fotografia</div>
                      )}
                      <div className="detail-content">
                        <div className="detail-title">
                          <span>Detalhes do registro</span>
                          <small>v{selected.version}</small>
                        </div>
                        <h3>{selected.title}</h3>
                        <p>
                          {selected.description ||
                            "Nenhuma descrição informada."}
                        </p>
                        <dl>
                          <div>
                            <dt>Responsável</dt>
                            <dd>{selected.user.name}</dd>
                          </div>
                          <div>
                            <dt>Capturado em</dt>
                            <dd>{formatDate(selected.capturedAt)}</dd>
                          </div>
                          <div>
                            <dt>Coordenadas</dt>
                            <dd>
                              {selected.latitude.toFixed(6)},{" "}
                              {selected.longitude.toFixed(6)}
                            </dd>
                          </div>
                          {selected.accuracy !== null && (
                            <div>
                              <dt>Precisão</dt>
                              <dd>{selected.accuracy.toFixed(1)} m</dd>
                            </div>
                          )}
                        </dl>
                        <RecordMap
                          latitude={selected.latitude}
                          longitude={selected.longitude}
                          title={selected.title}
                        />
                      </div>
                    </aside>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
