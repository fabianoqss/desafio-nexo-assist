# Nexo Assist

AI service desk agent for Nexo's IT support: employees describe their problem in a chat, and the agent checks their tickets, searches the help center, opens or updates tickets, and hands off to an analyst when needed.

Work in progress. Setup instructions, architecture overview and design decisions will be documented here.

## Rodando localmente

Pré-requisitos: Node 26 (`.nvmrc`), pnpm 12 e Docker com Compose.

1. Instale as dependências: `pnpm install`.
2. Crie o `.env` a partir do exemplo e troque todos os valores `change-me-...` por segredos reais. Gere o token de serviço com `openssl rand -hex 32` e as senhas com `openssl rand -hex 24`:

   ```bash
   cp .env.example .env
   ```

3. Suba o Postgres e o serviço de chamados (a migração roda sozinha antes do serviço):

   ```bash
   pnpm infra:up
   ```

4. Popule os dados do Anexo B (datas relativas ao momento em que o comando roda; pode rodar de novo para reiniciar a demo):

   ```bash
   set -a && . ./.env && set +a
   DATABASE_URL="postgres://nexo_tickets_app:${TICKETS_DB_PASSWORD}@127.0.0.1:5432/nexo_tickets" \
     pnpm --filter @nexo/ticket-service db:seed
   ```

5. Confira: `curl -s localhost:4001/ready` deve responder `{"status":"ok"}`.

Comandos úteis: `pnpm infra:logs`, `pnpm infra:down`, `pnpm test` (os testes de banco usam Testcontainers e precisam do Docker rodando).

Para simular o sistema legado instável, ajuste `FAILURE_RATE` (0 a 1) e `EXTRA_LATENCY_MS` no `.env` e rode `pnpm infra:up` de novo.

As portas são publicadas só em `127.0.0.1`. Cada serviço tem seu próprio banco (`nexo_tickets`, `nexo_api`), sem acesso ao banco do outro. No `nexo_tickets`, as migrações rodam com o papel dono (`nexo_tickets_owner`) e o serviço roda com `nexo_tickets_app`, que só pode ler, inserir e atualizar: sem DDL, `DELETE` ou `TRUNCATE`.
