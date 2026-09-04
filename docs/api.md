# Referência da API

A API REST é servida, por padrão, em `http://localhost:3001/api`. Esta referência documenta o contrato funcional do MVP; o código dos DTOs continua sendo a fonte executável das validações.

## Convenções

Rotas protegidas recebem o access token:

```http
Authorization: Bearer <access-token>
```

Corpos JSON usam `Content-Type: application/json`. Uploads usam `multipart/form-data` com o arquivo no campo `file`.

Respostas de erro seguem o formato padrão do NestJS e normalmente usam:

| Status | Significado                                          |
| -----: | ---------------------------------------------------- |
|  `400` | Payload, parâmetro ou arquivo inválido               |
|  `401` | Token ausente, inválido, expirado ou sessão revogada |
|  `403` | Usuário autenticado sem o perfil exigido             |
|  `404` | Recurso não encontrado                               |
|  `409` | Violação de regra de unicidade ou estado             |

## Health check

| Método | Rota      | Acesso  | Descrição                           |
| ------ | --------- | ------- | ----------------------------------- |
| `GET`  | `/health` | Público | Confirma que a API está respondendo |

Resposta:

```json
{ "status": "ok" }
```

## Autenticação

| Método  | Rota             | Acesso                    | Descrição                        |
| ------- | ---------------- | ------------------------- | -------------------------------- |
| `POST`  | `/auth/login`    | Público                   | Autentica e cria uma sessão      |
| `POST`  | `/auth/refresh`  | Público com refresh token | Renova o par de tokens           |
| `GET`   | `/auth/me`       | Autenticado               | Retorna o perfil atual           |
| `POST`  | `/auth/logout`   | Autenticado               | Revoga a sessão atual            |
| `PATCH` | `/auth/password` | Autenticado               | Troca a senha e exige novo login |

### Login

```json
{
  "email": "usuario@exemplo.com",
  "password": "senha-com-8-ou-mais",
  "deviceName": "iPhone de campo"
}
```

Resposta resumida:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "uuid",
    "name": "Usuário",
    "email": "usuario@exemplo.com",
    "role": "FIELD_USER"
  }
}
```

### Renovação

```json
{ "refreshToken": "..." }
```

### Troca de senha

```json
{
  "currentPassword": "senha-atual",
  "newPassword": "nova-senha"
}
```

## Usuários

Todas as rotas exigem perfil `ADMIN`.

| Método  | Rota                        | Descrição                          |
| ------- | --------------------------- | ---------------------------------- |
| `GET`   | `/users`                    | Lista usuários                     |
| `POST`  | `/users`                    | Cria usuário                       |
| `PATCH` | `/users/:id`                | Atualiza nome, e-mail ou perfil    |
| `PATCH` | `/users/:id/status`         | Bloqueia ou reativa usuário        |
| `POST`  | `/users/:id/reset-password` | Define nova senha e revoga sessões |

Criação:

```json
{
  "name": "Agente de Campo",
  "email": "agente@exemplo.com",
  "password": "senha-inicial",
  "role": "FIELD_USER"
}
```

Status:

```json
{ "isActive": false }
```

Os perfis aceitos são `ADMIN` e `FIELD_USER`.

## Registros administrativos

Todas as rotas exigem perfil `ADMIN`. Elas oferecem a visão global usada pelo dashboard; o mobile usa as rotas de sincronização filtradas pelo dono.

| Método   | Rota           | Descrição                                 |
| -------- | -------------- | ----------------------------------------- |
| `GET`    | `/records`     | Lista e filtra registros não excluídos    |
| `GET`    | `/records/:id` | Exibe detalhes de um registro             |
| `DELETE` | `/records/:id` | Faz exclusão lógica e incrementa a versão |

Filtros de `GET /records`:

| Parâmetro  | Regra                            |
| ---------- | -------------------------------- |
| `page`     | Inteiro a partir de 1; padrão 1  |
| `pageSize` | Inteiro entre 1 e 100; padrão 20 |
| `search`   | Texto de até 120 caracteres      |
| `from`     | Data ISO inicial                 |
| `to`       | Data ISO final                   |

## Upload de fotografias

| Método | Rota              | Acesso      | Descrição                      |
| ------ | ----------------- | ----------- | ------------------------------ |
| `POST` | `/uploads/photos` | Autenticado | Envia fotografia antes do push |

Regras:

- campo multipart: `file`;
- tamanho máximo: 15 MiB;
- formatos: JPEG e PNG;
- MIME type e assinatura binária devem coincidir.

Resposta:

```json
{ "storageKey": "records/<userId>/<uuid>.jpg" }
```

## Sincronização

As duas rotas exigem autenticação e sempre restringem os dados ao usuário do JWT.

| Método | Rota                           | Descrição                                |
| ------ | ------------------------------ | ---------------------------------------- |
| `POST` | `/sync/push`                   | Processa até 100 operações locais        |
| `GET`  | `/sync/pull?cursor=<data-ISO>` | Retorna alterações posteriores ao cursor |

### Push

```json
{
  "operations": [
    {
      "operationId": "14215a9d-95ee-4f32-a090-5eebf353e661",
      "recordId": "9b7b04cf-d682-4166-9a69-b4bb89197d91",
      "type": "CREATE",
      "baseVersion": 0,
      "payload": {
        "id": "9b7b04cf-d682-4166-9a69-b4bb89197d91",
        "title": "Inspeção da área norte",
        "description": "Coleta realizada sem conexão",
        "latitude": -3.7319,
        "longitude": -38.5267,
        "capturedAt": "2026-09-04T12:00:00.000Z",
        "photoKey": "records/<userId>/<uuid>.jpg"
      }
    }
  ]
}
```

Tipos aceitos: `CREATE`, `UPDATE` e `DELETE`. O `payload.id` deve coincidir com `recordId`; `baseVersion` é zero na criação.

Cada resultado possui um dos estados:

```json
{
  "results": [
    {
      "operationId": "14215a9d-95ee-4f32-a090-5eebf353e661",
      "recordId": "9b7b04cf-d682-4166-9a69-b4bb89197d91",
      "status": "APPLIED",
      "version": 1
    }
  ]
}
```

| Estado     | Interpretação do cliente                                       |
| ---------- | -------------------------------------------------------------- |
| `APPLIED`  | Confirmar a versão e remover a pendência                       |
| `CONFLICT` | Preservar dados locais e armazenar `serverRecord` para decisão |
| `REJECTED` | Encerrar a operação inválida sem criar conflito falso          |

### Pull

Sem cursor, retorna o histórico disponível daquele usuário. Com cursor ISO, retorna somente alterações posteriores. A resposta contém no máximo 500 registros no MVP.

```json
{
  "records": [],
  "cursor": "2026-09-04T12:05:00.000Z"
}
```

Registros com `deletedAt` preenchido são tombstones e devem ser removidos ou ocultados no cliente.

## Documentos

| Método  | Rota                      | Acesso      | Descrição                               |
| ------- | ------------------------- | ----------- | --------------------------------------- |
| `GET`   | `/documents`              | Autenticado | Lista documentos ativos                 |
| `GET`   | `/documents/admin`        | `ADMIN`     | Lista documentos ativos e inativos      |
| `POST`  | `/documents`              | `ADMIN`     | Publica um documento                    |
| `PUT`   | `/documents/:id/file`     | `ADMIN`     | Substitui arquivo e incrementa a versão |
| `PATCH` | `/documents/:id/status`   | `ADMIN`     | Ativa ou desativa publicação            |
| `GET`   | `/documents/:id/download` | Autenticado | Gera URL temporária de download         |

Criação usa `multipart/form-data`:

- `file`: arquivo obrigatório;
- `name`: nome de exibição opcional, até 160 caracteres;
- tamanho máximo: 30 MiB.

Formatos permitidos:

- PDF;
- JPEG e PNG;
- texto e CSV;
- Word, Excel e PowerPoint nos formatos atuais e legados.

O download retorna URL temporária, versão e checksum SHA-256. Usuários de campo não conseguem baixar documentos inativos.

## Validação

A API utiliza whitelist global e rejeita propriedades que não pertencem aos DTOs. Entre os limites relevantes:

- título do registro: 1 a 160 caracteres;
- descrição: até 4.000 caracteres;
- latitude: `-90` a `90`;
- longitude: `-180` a `180`;
- lote de sincronização: até 100 operações;
- senhas: 8 a 72 caracteres;
- e-mail: até 200 caracteres.

## Observação sobre versionamento da API

O MVP utiliza o prefixo estável `/api`, sem versão numérica. Antes de disponibilizar a API para clientes externos, a evolução recomendada é introduzir `/api/v1` ou versionamento por cabeçalho e publicar um contrato OpenAPI.
