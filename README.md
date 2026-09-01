# Registro de Campo

Aplicação offline-first para coleta de registros com foto e geolocalização, sincronizados com uma API e visualizados em um painel web.

## Pré-requisitos

- Node.js 22+
- pnpm 11+
- Docker Desktop em execução
- Xcode para simulador iOS

## Início rápido

1. Copie as variáveis locais: `cp .env.example .env`.
2. Abra o Docker Desktop.
3. Inicie os serviços: `docker compose up -d`.
4. Instale dependências: `pnpm install`.

PostgreSQL ficará disponível em `localhost:5433` e o console MinIO em `http://localhost:9001`.

Consulte [a arquitetura](docs/architecture.md) para a estratégia de sincronização e conflitos.
