# Arquitetura

O sistema adota uma abordagem offline-first. O app mobile persiste registros, operações pendentes e o catálogo de documentos em SQLite antes de chamar a API. PostgreSQL é a fonte compartilhada de dados e o MinIO armazena fotos e documentos.

## Componentes

- `apps/mobile`: React Native com Expo, SQLite, câmera, GPS e fila de sincronização.
- `apps/web`: Next.js para autenticação, dashboard e gestão de documentos.
- `apps/api`: NestJS, autenticação, sincronização e acesso ao PostgreSQL.
- `packages/shared-types`: contratos TypeScript compartilhados entre os clientes e a API.

## Sincronização

O cliente envia operações idempotentes (`operationId`) e depois busca alterações posteriores ao cursor local. Cada registro possui UUID, `version` e `updatedAt`.

Atualizações usam versionamento otimista: o servidor aceita uma operação apenas se `baseVersion` corresponder à versão atual. Em divergência, retorna conflito e a versão do servidor. O app preserva a alteração local para escolha do usuário, impedindo perda silenciosa de informação. O usuário pode aceitar integralmente o servidor ou reaplicar a versão local sobre a versão mais recente. Uma futura evolução poderá mesclar automaticamente alterações em campos independentes.

### Protocolo implementado

- `POST /api/uploads/photos` recebe fotografias autenticadas e retorna a chave armazenada no MinIO.
- `POST /api/sync/push` recebe operações em lote, usa `operationId` para idempotência e valida `baseVersion`.
- `GET /api/sync/pull` devolve alterações posteriores ao cursor do cliente.
- O mobile mantém `field_records`, `sync_queue` e `sync_state` no SQLite.
- Edições sincronizadas geram operações `UPDATE`; exclusões geram `DELETE` com exclusão lógica no servidor.
- Alterações sucessivas no mesmo registro são consolidadas em uma única operação pendente.
- Conflitos armazenam no SQLite a cópia retornada pelo servidor para comparação offline.
- Ao manter a versão local, o app cria uma nova operação idempotente baseada na versão atual do servidor.
- O retorno da conectividade dispara upload, push e pull sem bloquear o uso offline.

## Documentos offline

- `GET /api/documents` fornece o catálogo ativo para usuários autenticados.
- `POST /api/documents` publica arquivos e é restrito a administradores.
- `PUT /api/documents/:id/file` substitui o arquivo e incrementa sua versão.
- `PATCH /api/documents/:id/status` controla a publicação sem apagar o cadastro.
- `GET /api/documents/:id/download` gera um link temporário do MinIO.
- O mobile mantém os metadados em SQLite e os arquivos no diretório permanente do aplicativo.
- Versão e checksum SHA-256 indicam quando um documento baixado precisa ser atualizado.
- Um arquivo antigo permanece acessível offline até a nova versão ser baixada com sucesso.

## Prisma

Prisma é a camada de acesso ao PostgreSQL. O schema em `apps/api/prisma/schema.prisma` define os modelos versionados. `pnpm --filter @registro/api prisma:migrate -- --name nome_da_alteracao` gera e aplica uma migration; `pnpm --filter @registro/api prisma:generate` atualiza o cliente TypeScript após mudar o schema. Em desenvolvimento, `pnpm --filter @registro/api exec prisma studio` abre uma interface visual local para inspecionar os dados.
