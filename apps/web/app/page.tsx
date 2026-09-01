'use client';

import { FormEvent, useEffect, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
type Profile = { name: string; email: string; role: string };

export default function Home() {
  const [email, setEmail] = useState('admin@registro.local');
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { const token = localStorage.getItem('accessToken'); if (token) void getProfile(token); }, []);
  async function getProfile(token: string) {
    const response = await fetch(`${apiUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) setProfile(await response.json());
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const response = await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (!response.ok) { setError('E-mail ou senha inválidos.'); return; }
    const session = await response.json();
    localStorage.setItem('accessToken', session.accessToken); localStorage.setItem('refreshToken', session.refreshToken);
    setProfile(session.user); setPassword('');
  }
  function logout() { localStorage.clear(); setProfile(null); }

  if (profile) return <main><p className="eyebrow">Sessão ativa</p><h1>Olá, {profile.name}</h1><p>{profile.email} · {profile.role}</p><p>O dashboard de registros será exibido aqui na próxima etapa.</p><button onClick={logout}>Sair</button></main>;
  return <main><p className="eyebrow">Registro de Campo</p><h1>Entrar</h1><form onSubmit={login}><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label>{error && <p className="error">{error}</p>}<button>Entrar</button></form></main>;
}
