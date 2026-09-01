# Arquitetura

O sistema adota uma abordagem offline-first. O app mobile persiste registros e operações pendentes em SQLite antes de chamar a API. PostgreSQL é a fonte compartilhada de dados e o MinIO armazena fotos e documentos em desenvolvimento.

## Componentes

- `apps/mobile`: React Native com Expo, SQLite, câmera, GPS e fila de sincronização.
- `apps/web`: Next.js para autenticação, dashboard e gestão de documentos.
- `apps/api`: NestJS, autenticação, sincronização e acesso ao PostgreSQL.
- `packages/shared-types`: contratos TypeScript compartilhados entre os clientes e a API.

## Sincronização

O cliente envia operações idempotentes (`operationId`) e depois busca alterações posteriores ao cursor local. Cada registro possui UUID, `version` e `updatedAt`.

Atualizações usam versionamento otimista: o servidor aceita uma operação apenas se `baseVersion` corresponder à versão atual. Em divergência, retorna conflito e a versão do servidor. O app preserva a alteração local para escolha do usuário, impedindo perda silenciosa de informação. Alterações em campos diferentes poderão ser mescladas pelo servidor em uma etapa posterior; foto, exclusão e mudança concorrente do mesmo campo exigirão decisão explícita.

## Prisma

Prisma é a camada de acesso ao PostgreSQL. O schema em `apps/api/prisma/schema.prisma` define os modelos versionados. `pnpm --filter @registro/api prisma:migrate -- --name nome_da_alteracao` gera e aplica uma migration; `pnpm --filter @registro/api prisma:generate` atualiza o cliente TypeScript após mudar o schema. Em desenvolvimento, `pnpm --filter @registro/api exec prisma studio` abre uma interface visual local para inspecionar os dados.
