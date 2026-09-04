import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apiUrl = `http://localhost:${process.env.API_PORT ?? 3001}/api`;
const adminEmail = process.env.SEED_ADMIN_EMAIL;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const runId = randomUUID();
const testEmail = `mvp-smoke-${runId}@registro.invalid`;
const testPassword = `Mvp-${runId}!`;
const recordIds = [randomUUID(), randomUUID()];

type Session = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: string };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(path: string, init: RequestInit = {}, token?: string) {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

async function json<T>(response: Response, expectedStatus: number) {
  const body = (await response.json().catch(() => null)) as T;
  assert(
    response.status === expectedStatus,
    `${response.url} retornou ${response.status}; esperado ${expectedStatus}: ${JSON.stringify(body)}`,
  );
  return body;
}

function createOperation(operationId: string, recordId: string, title: string) {
  return {
    operations: [
      {
        operationId,
        recordId,
        type: "CREATE",
        baseVersion: 0,
        payload: {
          id: recordId,
          title,
          description: "Criado pelo smoke test do MVP",
          latitude: -3.7319,
          longitude: -38.5267,
          capturedAt: new Date().toISOString(),
          photoKey: null,
        },
      },
    ],
  };
}

async function main() {
  assert(adminEmail && adminPassword, "Credenciais do seed ausentes no .env");

  const health = await json<{ status: string }>(await request("/health"), 200);
  assert(health.status === "ok", "Health check não retornou status ok");

  const admin = await json<Session>(
    await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        deviceName: "mvp-smoke-test",
      }),
    }),
    201,
  );
  assert(admin.user.role === "ADMIN", "O usuário do seed não é administrador");

  const fieldUser = await json<{ id: string; role: string }>(
    await request(
      "/users",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Usuário Smoke Test",
          email: testEmail,
          password: testPassword,
          role: "FIELD_USER",
        }),
      },
      admin.accessToken,
    ),
    201,
  );

  let field = await json<Session>(
    await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        deviceName: "mvp-smoke-test",
      }),
    }),
    201,
  );

  await json(await request("/records", {}, field.accessToken), 403);
  await json(await request("/documents", {}, field.accessToken), 200);

  const adminOperationId = randomUUID();
  const fieldOperationId = randomUUID();
  const titlePrefix = `MVP smoke ${runId}`;
  const adminCreate = createOperation(
    adminOperationId,
    recordIds[0],
    `${titlePrefix} admin`,
  );
  const fieldCreate = createOperation(
    fieldOperationId,
    recordIds[1],
    `${titlePrefix} campo`,
  );

  const adminPush = await json<{ results: { status: string }[] }>(
    await request(
      "/sync/push",
      { method: "POST", body: JSON.stringify(adminCreate) },
      admin.accessToken,
    ),
    201,
  );
  assert(adminPush.results[0]?.status === "APPLIED", "Push do admin falhou");

  const fieldPush = await json<{ results: { status: string }[] }>(
    await request(
      "/sync/push",
      { method: "POST", body: JSON.stringify(fieldCreate) },
      field.accessToken,
    ),
    201,
  );
  assert(
    fieldPush.results[0]?.status === "APPLIED",
    "Push do usuário de campo falhou",
  );

  const repeatedPush = await json<{ results: { status: string }[] }>(
    await request(
      "/sync/push",
      { method: "POST", body: JSON.stringify(fieldCreate) },
      field.accessToken,
    ),
    201,
  );
  assert(
    repeatedPush.results[0]?.status === "APPLIED",
    "A repetição idempotente do push falhou",
  );

  const adminPull = await json<{ records: { id: string }[] }>(
    await request("/sync/pull", {}, admin.accessToken),
    200,
  );
  const fieldPull = await json<{ records: { id: string }[] }>(
    await request("/sync/pull", {}, field.accessToken),
    200,
  );
  assert(
    adminPull.records.some(({ id }) => id === recordIds[0]) &&
      !adminPull.records.some(({ id }) => id === recordIds[1]),
    "O pull do admin não ficou restrito aos registros próprios",
  );
  assert(
    fieldPull.records.some(({ id }) => id === recordIds[1]) &&
      !fieldPull.records.some(({ id }) => id === recordIds[0]),
    "O pull do usuário de campo recebeu registros de outra conta",
  );

  const dashboard = await json<{ items: { id: string }[] }>(
    await request(
      `/records?search=${encodeURIComponent(titlePrefix)}&pageSize=10`,
      {},
      admin.accessToken,
    ),
    200,
  );
  assert(
    recordIds.every((id) => dashboard.items.some((item) => item.id === id)),
    "O dashboard administrativo não recebeu todos os registros",
  );

  const fieldUpdate = {
    operations: [
      {
        ...fieldCreate.operations[0],
        operationId: randomUUID(),
        type: "UPDATE",
        baseVersion: 1,
        payload: {
          ...fieldCreate.operations[0].payload,
          title: `${titlePrefix} campo atualizado`,
        },
      },
    ],
  };
  const appliedUpdate = await json<{
    results: { status: string; version: number }[];
  }>(
    await request(
      "/sync/push",
      { method: "POST", body: JSON.stringify(fieldUpdate) },
      field.accessToken,
    ),
    201,
  );
  assert(
    appliedUpdate.results[0]?.status === "APPLIED" &&
      appliedUpdate.results[0]?.version === 2,
    "A atualização sincronizada não avançou para a versão 2",
  );

  const deletedRecord = await json<{ version: number; deletedAt: string }>(
    await request(
      `/records/${recordIds[1]}`,
      { method: "DELETE" },
      admin.accessToken,
    ),
    200,
  );
  assert(
    deletedRecord.version === 3 && Boolean(deletedRecord.deletedAt),
    "A exclusão administrativa não avançou o registro para a versão 3",
  );

  const staleMobileUpdate = {
    operations: [
      {
        ...fieldUpdate.operations[0],
        operationId: randomUUID(),
        baseVersion: 2,
        payload: {
          ...fieldUpdate.operations[0].payload,
          title: `${titlePrefix} edição offline`,
        },
      },
    ],
  };
  const conflictPush = await json<{
    results: {
      status: string;
      reason: string;
      version: number;
      serverRecord?: { deletedAt: string | null };
    }[];
  }>(
    await request(
      "/sync/push",
      { method: "POST", body: JSON.stringify(staleMobileUpdate) },
      field.accessToken,
    ),
    201,
  );
  const conflict = conflictPush.results[0];
  assert(
    conflict?.status === "CONFLICT" &&
      conflict.reason === "RECORD_DELETED" &&
      conflict.version === 3 &&
      Boolean(conflict.serverRecord?.deletedAt),
    "A edição offline não gerou o conflito esperado após a exclusão administrativa",
  );

  const rejectedOperation = {
    operations: [
      {
        ...adminCreate.operations[0],
        operationId: randomUUID(),
        type: "UPDATE",
        baseVersion: 1,
      },
    ],
  };
  const rejectedPush = await json<{ results: { status: string }[] }>(
    await request(
      "/sync/push",
      { method: "POST", body: JSON.stringify(rejectedOperation) },
      field.accessToken,
    ),
    201,
  );
  assert(
    rejectedPush.results[0]?.status === "REJECTED",
    "Um usuário conseguiu alterar o registro de outra conta",
  );

  field = await json<Session>(
    await request("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: field.refreshToken }),
    }),
    201,
  );
  await json(
    await request(
      `/users/${fieldUser.id}/status`,
      { method: "PATCH", body: JSON.stringify({ isActive: false }) },
      admin.accessToken,
    ),
    200,
  );
  await json(await request("/auth/me", {}, field.accessToken), 401);

  console.log("Smoke test do MVP concluído com sucesso.");
}

main()
  .finally(async () => {
    await prisma.syncOperation.deleteMany({
      where: { recordId: { in: recordIds } },
    });
    await prisma.fieldRecord.deleteMany({ where: { id: { in: recordIds } } });
    const testUser = await prisma.user.findUnique({
      where: { email: testEmail },
      select: { id: true },
    });
    if (testUser) {
      await prisma.authSession.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
    }
    await prisma.authSession.deleteMany({
      where: { deviceName: "mvp-smoke-test" },
    });
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
