"use client";

import {
  KeyRound,
  Pencil,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "./auth-client";

type UserRole = "ADMIN" | "FIELD_USER";

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type UsersPanelProps = {
  currentUserId: string;
  onLogout: () => Promise<void>;
};

const roleLabel = (role: UserRole) =>
  role === "ADMIN" ? "Administrador" : "Usuário de campo";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(value),
  );

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  if (Array.isArray(body?.message)) return body.message.join(" ");
  return body?.message || fallback;
}

export default function UsersPanel({
  currentUserId,
  onLogout,
}: UsersPanelProps) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("FIELD_USER");
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("FIELD_USER");
  const [statusUser, setStatusUser] = useState<UserItem | null>(null);
  const [resetUser, setResetUser] = useState<UserItem | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [modalError, setModalError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch("/users");
      if (!response.ok)
        throw new Error(
          await responseError(
            response,
            "Não foi possível carregar os usuários.",
          ),
        );
      setUsers((await response.json()) as UserItem[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Erro inesperado.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      const response = await authenticatedFetch("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      if (!response.ok)
        throw new Error(
          await responseError(response, "Não foi possível criar o usuário."),
        );
      setName("");
      setEmail("");
      setPassword("");
      setRole("FIELD_USER");
      setSuccess("Usuário criado. Ele já pode entrar no aplicativo mobile.");
      await loadUsers();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Não foi possível criar o usuário.",
      );
    } finally {
      setCreating(false);
    }
  };

  const beginEdit = (user: UserItem) => {
    setEditing(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setError("");
    setSuccess("");
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    setBusyId(editing.id);
    setError("");
    setSuccess("");
    try {
      const response = await authenticatedFetch(`/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          email: editEmail,
          role: editRole,
        }),
      });
      if (!response.ok)
        throw new Error(
          await responseError(
            response,
            "Não foi possível atualizar o usuário.",
          ),
        );
      setEditing(null);
      setSuccess("Dados do usuário atualizados.");
      await loadUsers();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Não foi possível atualizar o usuário.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const changeStatus = async () => {
    if (!statusUser || busyId) return;
    setBusyId(statusUser.id);
    setModalError("");
    try {
      const response = await authenticatedFetch(
        `/users/${statusUser.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !statusUser.isActive }),
        },
      );
      if (!response.ok)
        throw new Error(
          await responseError(response, "Não foi possível alterar o acesso."),
        );
      const wasActive = statusUser.isActive;
      setStatusUser(null);
      setSuccess(wasActive ? "Usuário bloqueado." : "Usuário reativado.");
      await loadUsers();
    } catch (statusError) {
      setModalError(
        statusError instanceof Error
          ? statusError.message
          : "Não foi possível alterar o acesso.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetUser || busyId) return;
    setBusyId(resetUser.id);
    setModalError("");
    try {
      const response = await authenticatedFetch(
        `/users/${resetUser.id}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: newPassword }),
        },
      );
      if (!response.ok)
        throw new Error(
          await responseError(response, "Não foi possível redefinir a senha."),
        );
      if (resetUser.id === currentUserId) {
        setResetUser(null);
        setNewPassword("");
        await onLogout();
        return;
      }
      setResetUser(null);
      setNewPassword("");
      setSuccess("Senha redefinida e sessões anteriores revogadas.");
      await loadUsers();
    } catch (resetError) {
      setModalError(
        resetError instanceof Error
          ? resetError.message
          : "Não foi possível redefinir a senha.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="users-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Controle de acesso</p>
          <h1>Usuários</h1>
          <p>Gerencie quem pode coletar dados e administrar o sistema.</p>
        </div>
        <Badge variant="success">
          {users.filter((user) => user.isActive).length} ativos
        </Badge>
      </div>

      <section className="user-create-card">
        <div>
          <span className="user-create-icon">
            <UserPlus aria-hidden="true" />
          </span>
          <p className="eyebrow">Novo acesso</p>
          <h2>Criar usuário</h2>
          <p>A senha inicial poderá ser redefinida pelo administrador.</p>
        </div>
        <form className="user-form" onSubmit={createUser}>
          <label>
            <span>Nome</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={120}
              required
            />
          </label>
          <label>
            <span>E-mail</span>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={200}
              required
            />
          </label>
          <label>
            <span>Senha inicial</span>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            <span>Perfil</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
            >
              <option value="FIELD_USER">Usuário de campo</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </label>
          <Button type="submit" variant="accent" disabled={creating}>
            {creating ? "Criando…" : "Criar usuário"}
          </Button>
        </form>
      </section>

      {error ? <p className="feedback error">{error}</p> : null}
      {success ? (
        <p className="feedback success" role="status">
          {success}
        </p>
      ) : null}

      {editing ? (
        <section className="user-edit-card">
          <div className="users-heading">
            <div>
              <h2>Editar usuário</h2>
              <p>Alterar o perfil encerra as sessões atuais desse usuário.</p>
            </div>
          </div>
          <form className="user-edit-form" onSubmit={saveEdit}>
            <label>
              <span>Nome</span>
              <Input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                minLength={2}
                maxLength={120}
                required
              />
            </label>
            <label>
              <span>E-mail</span>
              <Input
                type="email"
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
                maxLength={200}
                required
              />
            </label>
            <label>
              <span>Perfil</span>
              <select
                value={editRole}
                disabled={editing.id === currentUserId}
                onChange={(event) =>
                  setEditRole(event.target.value as UserRole)
                }
              >
                <option value="FIELD_USER">Usuário de campo</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </label>
            <div className="user-edit-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busyId === editing.id}>
                {busyId === editing.id ? "Salvando…" : "Salvar alterações"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="users-card">
        <div className="users-heading">
          <div>
            <h2>Contas cadastradas</h2>
            <p>{users.length} usuário(s) no sistema</p>
          </div>
        </div>
        {loading ? (
          <div className="state-message">
            <span className="spinner" /> Carregando usuários…
          </div>
        ) : users.length === 0 ? (
          <div className="state-message">Nenhum usuário cadastrado.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                    </td>
                    <td>
                      <Badge
                        variant={
                          user.role === "ADMIN" ? "default" : "secondary"
                        }
                      >
                        {roleLabel(user.role)}
                      </Badge>
                    </td>
                    <td>
                      <Badge variant={user.isActive ? "success" : "outline"}>
                        {user.isActive ? "Ativo" : "Bloqueado"}
                      </Badge>
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>
                      <div className="user-actions">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => beginEdit(user)}
                        >
                          <Pencil aria-hidden="true" /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setModalError("");
                            setNewPassword("");
                            setResetUser(user);
                          }}
                        >
                          <KeyRound aria-hidden="true" /> Senha
                        </Button>
                        <Button
                          size="sm"
                          variant={user.isActive ? "destructive" : "default"}
                          disabled={user.id === currentUserId}
                          title={
                            user.id === currentUserId
                              ? "Você não pode bloquear sua própria conta"
                              : undefined
                          }
                          onClick={() => {
                            setModalError("");
                            setStatusUser(user);
                          }}
                        >
                          {user.isActive ? (
                            <UserRoundX aria-hidden="true" />
                          ) : (
                            <UserRoundCheck aria-hidden="true" />
                          )}
                          {user.isActive ? "Bloquear" : "Reativar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AlertDialog
        open={statusUser !== null}
        onOpenChange={(open) => {
          if (!open && !busyId) {
            setStatusUser(null);
            setModalError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusUser?.isActive ? "Bloquear usuário?" : "Reativar usuário?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusUser?.isActive
                ? `${statusUser.name} perderá o acesso imediatamente e todas as sessões serão encerradas.`
                : `${statusUser?.name} poderá entrar novamente no sistema.`}
            </AlertDialogDescription>
            {modalError ? (
              <p
                className="text-sm font-semibold text-destructive"
                role="alert"
              >
                {modalError}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busyId}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant={statusUser?.isActive ? "destructive" : "default"}
              disabled={!!busyId}
              onClick={(event) => {
                event.preventDefault();
                void changeStatus();
              }}
            >
              {busyId
                ? "Aguarde…"
                : statusUser?.isActive
                  ? "Bloquear acesso"
                  : "Reativar acesso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={resetUser !== null}
        onOpenChange={(open) => {
          if (!open && !busyId) {
            setResetUser(null);
            setNewPassword("");
            setModalError("");
          }
        }}
      >
        <AlertDialogContent>
          <form onSubmit={resetPassword}>
            <AlertDialogHeader>
              <AlertDialogTitle>Redefinir senha</AlertDialogTitle>
              <AlertDialogDescription>
                Defina uma nova senha para {resetUser?.name}. Todas as sessões
                atuais dessa conta serão encerradas.
              </AlertDialogDescription>
              <label className="reset-password-field">
                <span>Nova senha</span>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  required
                />
              </label>
              {modalError ? (
                <p
                  className="text-sm font-semibold text-destructive"
                  role="alert"
                >
                  {modalError}
                </p>
              ) : null}
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-5">
              <AlertDialogCancel type="button" disabled={!!busyId}>
                Cancelar
              </AlertDialogCancel>
              <Button
                type="submit"
                disabled={!!busyId || newPassword.length < 8}
              >
                {busyId ? "Salvando…" : "Redefinir senha"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
