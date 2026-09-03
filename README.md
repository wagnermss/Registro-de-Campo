# Registro de Campo

Plataforma offline-first para coleta de registros em campo com fotografia e geolocalização. O sistema é composto por um aplicativo mobile, uma API compartilhada e um painel web para consulta dos registros e gestão de documentos.

O aplicativo mobile mantém os dados no próprio dispositivo, permitindo consultar e criar registros sem conexão. Quando a conectividade é restabelecida, os itens pendentes poderão ser sincronizados com o servidor sem interromper o trabalho em campo.

## Funcionalidades

### Mobile

- Autenticação com sessão armazenada no Keychain/Keystore do dispositivo.
- Persistência local com SQLite.
- Criação e consulta de registros offline.
- Edição e exclusão lógica de registros offline.
- Captura de fotografia e geolocalização.
- Fila persistente de registros pendentes de sincronização.
- Sincronização automática ao recuperar conectividade e acionamento manual.
- Abertura offline com restauração da sessão local.
- Catálogo, download e visualização offline de documentos.
- Identificação de novas versões por versão e checksum SHA-256.

### Web

- Autenticação integrada à mesma API do mobile.
- Controle de acesso baseado no perfil do usuário.
- Dashboard administrativo com indicadores, filtros, fotografias, mapa e exclusão lógica de registros.
- Publicação, download, substituição e ativação de documentos.

### Backend

- API REST desenvolvida com NestJS.
- Autenticação por access token e refresh token JWT.
- Senhas armazenadas por meio de hash com bcryptjs.
- Validação de dados recebidos pela API.
- Persistência central em PostgreSQL com Prisma ORM.
- Modelos para usuários, registros de campo, documentos e operações de sincronização.
- Upload de fotografias para o MinIO por API compatível com S3.
- Armazenamento versionado de documentos com links temporários de download.
- Sincronização incremental por push/pull com operações idempotentes.

## Tecnologias

| Camada           | Tecnologias                                              |
| ---------------- | -------------------------------------------------------- |
| Mobile           | React Native, Expo, Expo Router, NativeWind e TypeScript |
| Dados locais     | Expo SQLite e Expo File System                           |
| Recursos nativos | Expo Camera, Location, Secure Store e Sharing            |
| Web              | Next.js, React, shadcn/ui, Tailwind CSS e TypeScript     |
| API              | Node.js, NestJS, Passport e JWT                          |
| Persistência     | PostgreSQL e Prisma ORM                                  |
| Arquivos         | MinIO, com API compatível com Amazon S3                  |
| Infraestrutura   | Docker e Docker Compose                                  |
| Monorepo         | pnpm Workspaces                                          |
| Qualidade        | TypeScript e Prettier                                    |

## Arquitetura

O projeto utiliza um monorepo para manter clientes, API e contratos compartilhados no mesmo repositório:

```text
apps/
  api/       API NestJS e schema Prisma
  mobile/    aplicativo React Native com Expo
  web/       painel web Next.js
packages/
  shared-types/  contratos TypeScript compartilhados
docs/        decisões e documentação de arquitetura
```

O PostgreSQL é a fonte compartilhada de dados do servidor. No mobile, o SQLite funciona como fonte local, e cada novo registro recebe um identificador próprio e um estado de sincronização. Fotos e documentos baixados são armazenados no sistema de arquivos do dispositivo e referenciados pelo banco local.

Web e mobile compartilham a mesma linguagem visual: verde operacional, superfícies minerais claras, âmbar para atenção, cantos moderados e uma escala consistente de espaçamento. O web usa componentes locais do shadcn/ui sobre Tailwind CSS; o mobile implementa equivalentes nativos com NativeWind, preservando comportamento e acessibilidade próprios de iOS e Android.

## Sincronização e conflitos

A estratégia planejada combina operações idempotentes e versionamento otimista. Cada operação possui um identificador único, e cada registro mantém uma versão. O servidor compara a versão base enviada pelo cliente com a versão atual antes de aceitar uma alteração.

Caso as versões sejam diferentes, a operação é identificada como conflito e a versão local é preservada para resolução, evitando perda silenciosa de dados. A sincronização será realizada em duas fases: envio das operações locais pendentes e download incremental das alterações do servidor.

No mobile, o usuário pode comparar a versão local com a versão atual do servidor. Ao aceitar o servidor, a operação pendente é descartada; ao manter a versão local, ela é reaplicada sobre a versão mais recente com um novo identificador idempotente.

Mais detalhes estão disponíveis em [docs/architecture.md](docs/architecture.md).

## Estado do projeto

O projeto está em desenvolvimento. A infraestrutura, autenticação, persistência central, criação, edição e exclusão offline, sincronização push/pull, resolução de conflitos, dashboard web e documentos offline já estão estruturados. O sistema visual compartilhado está em implantação. As próximas entregas incluem concluir essa migração, adicionar testes automatizados e preparar a aplicação para produção.
