"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  API_URL,
  authenticatedFetch,
  clearTokens,
  saveTokens,
} from "./auth-client";
import Dashboard from "./dashboard";

type Profile = { name: string; email: string; role: string };

export default function Home() {
  const [email, setEmail] = useState("admin@registro.local");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (token) void getProfile(token);
  }, []);
  async function getProfile(token: string) {
    const response = await authenticatedFetch("/auth/me");
    if (response.ok) setProfile(await response.json());
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, deviceName: "web" }),
    });
    if (!response.ok) {
      setError("E-mail ou senha inválidos.");
      return;
    }
    const session = await response.json();
    saveTokens(session);
    setProfile(session.user);
    setPassword("");
  }
  async function logout() {
    await authenticatedFetch("/auth/logout", { method: "POST" }).catch(
      () => undefined,
    );
    clearTokens();
    setProfile(null);
  }

  if (profile) return <Dashboard profile={profile} onLogout={logout} />;
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-intro">
          <span className="brand-mark">RC</span>
          <p className="eyebrow">Registro de Campo</p>
          <h1>Dados do campo, organizados em um só lugar.</h1>
          <p>
            Acompanhe registros, evidências fotográficas e localizações enviadas
            pelas equipes.
          </p>
        </div>
        <form className="login-form" onSubmit={login}>
          <div>
            <p className="eyebrow">Acesso seguro</p>
            <h2>Entrar no painel</h2>
          </div>
          <label>
            <span>E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Senha</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button>Entrar</button>
        </form>
      </section>
    </main>
  );
}
