# Plano 2: Contratos e serviço de chamados

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** um serviço de chamados separado (`apps/ticket-service`) que simula o sistema legado, com banco próprio, API HTTP autenticada, regras de privacidade, idempotência nas escritas e injeção de falhas configurável, mais os contratos Zod (`packages/contracts`) que a API (Plano 3) vai usar para falar com ele, tudo subindo com Docker Compose.

**Arquitetura:** hexagonal. `application/` tem os casos de uso e as portas (`TicketRepository`, `UnitOfWork`, `Clock`) e usa `@nexo/domain` para toda regra de negócio. `adapters/http` (Hono) e `adapters/persistence` (Drizzle + Postgres) implementam as bordas. O serviço confia na API como único cliente: ela se autentica com um token de serviço e informa o usuário logado nos headers `X-Actor-Id` e `X-Actor-Role`. O serviço aplica a privacidade de novo (defesa em profundidade).

**Stack:** Node 26 (executa `.ts` direto em dev), Hono + `@hono/node-server`, `@hono/zod-validator`, Zod 4, Drizzle ORM + drizzle-kit + `pg`, pino, esbuild (bundle de produção), Vitest + `@testcontainers/postgresql`, Docker Compose com Postgres 18.

**Spec:** `docs/design/design-doc.md` (seções 3, 5 "Unreliable ticket service", 6, 9, 10 e 11)

## Pré-requisito

O PR da branch `feat/domain-rules` (Plano 1) precisa estar mergeado. Este plano parte da `main` atualizada.

## Responsabilidades e fluxo de git

- **Todas as tasks:** Claude escreve o código e explica cada task ao Fabiano; Fabiano revisa cada commit.
- Branch única: `feat/ticket-service`. Commit **e push** ao fim de cada task. Nunca commitar na `main`. Fabiano abre o PR.
- Mensagens de commit em inglês, explicando o porquê das decisões. Sem comentários no código.

## Global Constraints

- Tudo do Plano 1 continua valendo: Node `>=26`, pnpm `12.x`, TypeScript estrito (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), ESM, sem `any`, sem comentários.
- Dependências com versão exata (`saveExact`); usar a última versão estável no momento da instalação; `pnpm audit --audit-level=high` sem achados.
- Pastas: DTOs em `request/` e `response/`; portas em `application/ports/`; adaptadores em `adapters/<tipo>/`. Testes espelham `src/` em `test/`.
- Toda regra de negócio vem de `@nexo/domain`. O serviço não reimplementa prioridade, prazo, vencido, reabertura nem duplicidade.
- Datas trafegam em JSON como ISO 8601 UTC (`2026-12-09T12:43:00.000Z`). `dueAt` e `overdue` são calculados na leitura, nunca gravados.
- Ids de chamado: `INC-<número>` e `REQ-<número>`, com sequências próprias no Postgres começando em `INC-20400` e `REQ-10500` (os números menores ficam para o seed).
- Segredos só em variáveis de ambiente. `.env.example` commitado, `.env` nunca. Portas do Compose publicadas só em `127.0.0.1`.
- Um banco por serviço: `nexo_tickets` (este plano) e `nexo_api` (criado vazio aqui, usado no Plano 3), cada um com seu próprio usuário, sem acesso ao banco do outro.
- Logs JSON (pino) sem corpo de requisição nem dados pessoais: só ids, método, rota, status e duração.
- Limites de texto: `title` 1–120, `description` 1–4000, `item` até 80, `summary` 1–500, `message` 1–4000 caracteres (após `trim`). Corpo HTTP até 64 KB.
- Cobertura mínima: `apps/ticket-service/src` 85% linhas e 80% branches (sem contar os pontos de entrada `main.ts`, `migrate.ts` e `seed/run-seed.ts`); `packages/contracts/src` 90% linhas.

## Contrato HTTP do serviço

Todas as rotas `/tickets*` exigem `Authorization: Bearer <TICKET_SERVICE_API_TOKEN>`, `X-Actor-Id` (UUID) e `X-Actor-Role` (`EMPLOYEE` | `ANALYST`). Escritas (`POST`) exigem `Idempotency-Key` (8–128 caracteres).

| Método e rota                                          | Quem             | Faz                                                               | Sucesso |
| ------------------------------------------------------ | ---------------- | ----------------------------------------------------------------- | ------- |
| `GET /health`                                          | público          | Liveness: `{ "status": "ok" }`                                    | 200     |
| `GET /ready`                                           | público          | Readiness: `SELECT 1` no banco (timeout 1 s); 503 se falhar       | 200     |
| `GET /tickets?requesterId&status&limit`                | ambos            | Lista chamados, `lastUpdateAt` desc, `limit` 1–100 (padrão 50)    | 200     |
| `GET /tickets/duplicates?category&summary&requesterId` | ambos            | `findDuplicateCandidates` sobre os chamados do solicitante        | 200     |
| `GET /tickets/:id`                                     | dono ou analista | Detalhe                                                           | 200     |
| `POST /tickets`                                        | funcionário      | Cria a partir de um rascunho; `requesterId` = ator; status `OPEN` | 201     |
| `POST /tickets/:id/info`                               | dono ou analista | Acrescenta informação; atualiza `lastUpdateAt`                    | 200     |
| `POST /tickets/:id/reopen`                             | dono             | Reabre (`canReopen`); status `OPEN`; limpa `resolvedAt`           | 200     |
| `POST /tickets/:id/status`                             | analista         | Muda status (`canChangeStatus`); `RESOLVED` grava `resolvedAt`    | 200     |

Regras de acesso: um funcionário só vê os próprios chamados. `requesterId` diferente do próprio dá **403**; um `id` de chamado de outra pessoa dá **404** (não revela que o chamado existe). Analista vê tudo; sem `requesterId`, lista todos.

Respostas de escrita repetidas com a mesma `Idempotency-Key` devolvem o estado atual do mesmo chamado, com o header `Idempotent-Replayed: true`, sem gravar de novo.

| Código de erro (`error.code`) | HTTP | Quando                                                   |
| ----------------------------- | ---- | -------------------------------------------------------- |
| `VALIDATION_FAILED`           | 400  | Corpo, query ou header inválido                          |
| `UNAUTHORIZED`                | 401  | Token de serviço ausente ou errado                       |
| `FORBIDDEN`                   | 403  | Papel sem permissão, ou `requesterId` de outra pessoa    |
| `NOT_FOUND`                   | 404  | Chamado inexistente ou de outra pessoa                   |
| `PAYLOAD_TOO_LARGE`           | 413  | Corpo acima de 64 KB                                     |
| `IDEMPOTENCY_KEY_REUSED`      | 409  | Mesma chave com outra operação ou outro corpo            |
| `TICKET_RESOLVED`             | 409  | Informação acrescentada a chamado resolvido (use reopen) |
| `REOPEN_NOT_ALLOWED`          | 409  | Não resolvido ou fora da janela de 7 dias                |
| `INVALID_STATUS_TRANSITION`   | 409  | Transição negada por `canChangeStatus`                   |
| `SERVICE_UNAVAILABLE`         | 503  | Falha injetada                                           |
| `INTERNAL_ERROR`              | 500  | Erro inesperado (mensagem genérica, detalhe só no log)   |

Formato de erro: `{ "error": { "code": "<código>", "message": "<texto>" } }`.

## Review Focus

1. **Funcionário adivinhando o id de um chamado alheio** (`GET /tickets/INC-20320` por Ana): deve receber 404, nunca os dados. Testes nas Tasks 5 e 7.
2. **Cliente que reenvia um `POST /tickets` após timeout**: a mesma `Idempotency-Key` devolve o mesmo chamado e não cria outro, inclusive com duas requisições simultâneas; chave igual com corpo diferente dá 409. Testes nas Tasks 4, 6 e 7.
3. **Dois analistas mudando o status do mesmo chamado ao mesmo tempo**: a linha é travada (`SELECT ... FOR UPDATE`); um vence e o outro recebe 409, sem estado corrompido. Teste na Task 4.
4. **Seed rodado em outro dia**: "vencido" e "resolvido há pouco" precisam continuar verdadeiros, então as datas do seed são relativas ao momento em que ele roda. Teste na Task 9.
5. **Falha injetada no meio de uma escrita**: a falha acontece antes do handler, nunca depois de gravar, e nunca em `/health` ou `/ready`. Teste na Task 8.

---

### Task 1: Complementos do domínio

**Files:**

- Create: `packages/domain/src/enums/user-role.ts`, `packages/domain/src/enums/ticket-event-kind.ts`, `packages/domain/src/rules/status-transition.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/rules/status-transition.test.ts`, `packages/domain/test/enums/enums.test.ts`

**Interfaces:**

- Produces, no padrão `as const` do Plano 1:
  - `UserRole`: `EMPLOYEE`, `ANALYST`
  - `TicketEventKind`: `CREATED`, `INFO_ADDED`, `REOPENED`, `TRANSFERRED`, `ASSUMED`, `UPDATED`, `RESOLVED`
- Produces: `type StatusChangeTarget = Exclude<TicketStatus, 'OPEN'>`
- Produces: `canChangeStatus(from: TicketStatus, to: TicketStatus): boolean`: falso quando `from === to`, quando `from` é `RESOLVED` (só reabertura sai de resolvido) ou quando `to` é `OPEN` (só criação e reabertura levam a `OPEN`); verdadeiro nos demais casos.
- Produces: `statusChangeEventKind(to: StatusChangeTarget): TicketEventKind`: `WAITING_ANALYST` → `TRANSFERRED`, `IN_PROGRESS` → `ASSUMED`, `APPROVED` → `UPDATED`, `RESOLVED` → `RESOLVED`.

- [ ] **Step 1: Escrever os testes que falham:** valores exatos de `UserRole` e `TicketEventKind` em `enums.test.ts`; em `status-transition.test.ts`, `it.each` com `OPEN→IN_PROGRESS` true, `IN_PROGRESS→RESOLVED` true, `WAITING_ANALYST→APPROVED` true, `IN_PROGRESS→IN_PROGRESS` false, `RESOLVED→IN_PROGRESS` false, `IN_PROGRESS→OPEN` false; e os 4 mapeamentos de `statusChangeEventKind`.
- [ ] **Step 2: Rodar** `pnpm test status-transition enums`. Esperado: FAIL.
- [ ] **Step 3: Implementar** os dois enums e as duas funções (`statusChangeEventKind` como tabela `satisfies Record<StatusChangeTarget, TicketEventKind>`); exportar tudo em `src/index.ts`.
- [ ] **Step 4: Rodar** `pnpm test --coverage && pnpm typecheck && pnpm lint`. Esperado: PASS, domínio com 100%.
- [ ] **Step 5: Commit e push:** `feat(domain): add user roles, ticket events and status transitions`.

### Task 2: `packages/contracts`

**Files:**

- Create: `packages/contracts/{package.json,tsconfig.json,vitest.config.ts}`
- Create: `packages/contracts/src/common/{http-headers.ts,error-response.ts}`
- Create: `packages/contracts/src/tickets/request/{create-ticket-request.ts,list-tickets-query.ts,duplicate-search-query.ts,add-ticket-info-request.ts,reopen-ticket-request.ts,change-ticket-status-request.ts}`
- Create: `packages/contracts/src/tickets/response/{ticket-response.ts,duplicate-candidate-response.ts}`
- Create: `packages/contracts/src/index.ts`
- Modify: `vitest.config.ts` (limite de cobertura de `packages/contracts/src/**/*.ts`: 90% linhas)
- Test: `packages/contracts/test/tickets/{create-ticket-request,list-tickets-query,ticket-response}.test.ts`, `packages/contracts/test/common/http-headers.test.ts`

**Interfaces:**

- Consumes: enums de `@nexo/domain` (dependência `workspace:*`), usados com `z.enum(Category)` etc.
- Produces (cada schema exporta também `type X = z.infer<typeof XSchema>`):
  - `SERVICE_AUTH_HEADER = 'authorization'`, `ACTOR_ID_HEADER = 'x-actor-id'`, `ACTOR_ROLE_HEADER = 'x-actor-role'`, `IDEMPOTENCY_KEY_HEADER = 'idempotency-key'`, `IDEMPOTENT_REPLAYED_HEADER = 'idempotent-replayed'`, `REQUEST_ID_HEADER = 'x-request-id'`
  - `ActorHeadersSchema`: `{ 'x-actor-id': uuid, 'x-actor-role': UserRole }`
  - `IdempotencyKeySchema`: string 8–128, `[A-Za-z0-9_-]`
  - `ErrorCode` (enum `as const` com os códigos da tabela acima) e `ErrorResponseSchema`: `{ error: { code: ErrorCode; message: string } }`
  - `TicketIdSchema`: `/^(INC|REQ)-\d{5,}$/`
  - `CreateTicketRequestSchema`: campos de `TicketDraft` com os limites de texto e `.trim()`; `item` opcional
  - `ListTicketsQuerySchema`: `{ requesterId?: uuid; status?: TicketStatus; limit: number }` (coerce de string, 1–100, padrão 50)
  - `DuplicateSearchQuerySchema`: `{ category: Category; summary: string; requesterId?: uuid }`
  - `AddTicketInfoRequestSchema` e `ReopenTicketRequestSchema`: `{ message: string }`
  - `ChangeTicketStatusRequestSchema`: `{ status: StatusChangeTarget }`
  - `TicketResponseSchema`: todos os campos de `Ticket` com datas como `z.iso.datetime()`, mais `dueAt: iso` e `overdue: boolean`; `item` e `resolvedAt` opcionais
  - `DuplicateCandidateResponseSchema`: `{ ticket: TicketResponse; similarity: number; action: DuplicateAction }`
- Produces: uma checagem de tipo em `create-ticket-request.ts` garantindo que `CreateTicketRequest` é atribuível a `TicketDraft` (`satisfies`/atribuição tipada), para o contrato não se desviar do domínio.

- [ ] **Step 1: Escrever os testes que falham:**
  - um rascunho válido de VPN passa e sai com `title` sem espaços nas pontas; `title: '   '` falha; `title` com 121 caracteres falha; `category: 'HR'` falha;
  - `ListTicketsQuerySchema.parse({})` dá `{ limit: 50 }`; `limit: '500'` falha; `limit: '10'` vira `10`;
  - `TicketIdSchema` aceita `INC-20311` e `REQ-10442`, recusa `inc-20311`, `INC-1` e `INC-20311; DROP`;
  - `ActorHeadersSchema` recusa id que não é UUID e papel `ADMIN`;
  - `TicketResponseSchema` aceita um chamado completo serializado e recusa `dueAt: 'amanhã'`.
- [ ] **Step 2: Rodar** `pnpm test contracts`. Esperado: FAIL.
- [ ] **Step 3: Implementar** o pacote no mesmo molde do `@nexo/domain` (`exports: { ".": "./src/index.ts" }`, script `typecheck`) e os schemas acima.
- [ ] **Step 4: Rodar** `pnpm test --coverage && pnpm typecheck && pnpm lint && pnpm format:check`. Esperado: PASS.
- [ ] **Step 5: Commit e push:** `feat(contracts): add ticket service HTTP contracts`.

### Task 3: Esqueleto do `ticket-service`

**Files:**

- Create: `apps/ticket-service/{package.json,tsconfig.json,vitest.config.ts}`
- Create: `apps/ticket-service/src/config/env.ts`
- Create: `apps/ticket-service/src/adapters/logging/logger.ts`
- Create: `apps/ticket-service/src/adapters/http/{app.ts,error-handler.ts}`, `apps/ticket-service/src/adapters/http/routes/health-routes.ts`, `apps/ticket-service/src/adapters/http/middleware/request-logger.ts`
- Create: `apps/ticket-service/src/application/errors/application-error.ts`
- Create: `apps/ticket-service/src/main.ts`
- Modify: `vitest.config.ts` (limites de cobertura do serviço; excluir os pontos de entrada `src/main.ts`, `src/migrate.ts` e `src/seed/run-seed.ts`)
- Test: `apps/ticket-service/test/config/env.test.ts`, `apps/ticket-service/test/adapters/http/health-routes.test.ts`, `apps/ticket-service/test/adapters/http/error-handler.test.ts`

**Interfaces:**

- Produces: `loadEnv(source: Record<string, string | undefined>): Env`, onde `Env` tem `NODE_ENV` (`development` | `test` | `production`, padrão `development`), `HOST` (padrão `0.0.0.0`), `PORT` (padrão `4001`), `DATABASE_URL` (obrigatória, `postgres://` ou `postgresql://`), `TICKET_SERVICE_API_TOKEN` (obrigatório, mínimo 32 caracteres), `FAILURE_RATE` (0–1, padrão 0), `EXTRA_LATENCY_MS` (0–10000, padrão 0), `LOG_LEVEL` (padrão `info`). Erro de validação lista os nomes das variáveis inválidas, **nunca os valores**.
- Produces: `createLogger(level: string): Logger` (pino, JSON em stdout, `redact` de `authorization`).
- Produces: classes `ApplicationError` (base, com `code: ErrorCode`), `NotFoundError`, `ForbiddenError`, `ConflictError` (recebe o `code` 409 específico), `ValidationError`.
- Produces: `createApp(deps: AppDependencies): Hono`; nesta task `AppDependencies = { logger: Logger; checkReadiness: () => Promise<boolean> }`, ampliada nas Tasks 7 e 8.
- Produces: `errorHandler` que converte `ApplicationError` no código e status da tabela, `ZodError` em 400 `VALIDATION_FAILED`, e qualquer outro erro em 500 `INTERNAL_ERROR` com mensagem genérica (o erro completo vai só para o log).
- Produces: middleware de log por requisição com `requestId` (reaproveita `X-Request-Id` válido ou gera UUID, devolve no header), método, rota, status e `durationMs`.
- `main.ts`: carrega o env, cria logger e app, sobe com `@hono/node-server`, e em `SIGTERM`/`SIGINT` fecha o servidor antes de sair. Nesta task `checkReadiness` é `async () => true`; a Task 4 troca pela checagem do banco e passa a fechar o pool no shutdown.
- Scripts do `package.json`: `dev` (`node --watch src/main.ts`) e `typecheck`. O script `build` entra na Task 10.

- [ ] **Step 1: Escrever os testes que falham:** `loadEnv` com o mínimo válido aplica os padrões; token com 31 caracteres falha e a mensagem contém `TICKET_SERVICE_API_TOKEN` mas não o valor; `FAILURE_RATE: '1.5'` falha; `GET /health` → 200 `{ status: 'ok' }` com header `x-request-id`; `GET /ready` → 200 quando `checkReadiness` resolve `true` e 503 `SERVICE_UNAVAILABLE` quando resolve `false` ou rejeita; uma rota de teste que lança `NotFoundError` vira 404 no formato de erro, e uma que lança `Error('db password leaked')` vira 500 sem esse texto no corpo.
- [ ] **Step 2: Rodar** `pnpm test ticket-service`. Esperado: FAIL.
- [ ] **Step 3: Implementar** os arquivos acima.
- [ ] **Step 4: Rodar** `pnpm test --coverage && pnpm typecheck && pnpm lint && pnpm format:check`. Esperado: PASS.
- [ ] **Step 5: Commit e push:** `feat(ticket-service): scaffold service with config, logging and health checks`.

### Task 4: Persistência (Drizzle + Postgres)

**Files:**

- Create: `apps/ticket-service/drizzle.config.ts`
- Create: `apps/ticket-service/src/application/ports/{ticket-repository.ts,idempotency-repository.ts,unit-of-work.ts,clock.ts}`
- Create: `apps/ticket-service/src/adapters/persistence/{schema.ts,database.ts,drizzle-unit-of-work.ts,drizzle-ticket-repository.ts,drizzle-idempotency-repository.ts}`
- Create: `apps/ticket-service/src/adapters/persistence/migrations/` (gerada por `drizzle-kit generate`)
- Create: `apps/ticket-service/src/migrate.ts`
- Test: `apps/ticket-service/test/support/postgres-container.ts`, `apps/ticket-service/test/adapters/persistence/drizzle-ticket-store.test.ts`

**Interfaces:**

- Produces (portas):

  ```ts
  interface TicketListFilter {
    requesterId?: string;
    status?: TicketStatus;
    limit: number;
  }
  interface NewTicketEvent {
    ticketId: string;
    kind: TicketEventKind;
    actorId: string;
    payload: Record<string, unknown>;
    createdAt: Date;
  }
  interface TicketRepository {
    findById(id: string): Promise<Ticket | undefined>;
    findByIdForUpdate(id: string): Promise<Ticket | undefined>;
    list(filter: TicketListFilter): Promise<Ticket[]>;
    nextId(type: TicketType): Promise<string>;
    insert(ticket: Ticket): Promise<void>;
    update(ticket: Ticket): Promise<void>;
    appendEvent(event: NewTicketEvent): Promise<void>;
  }
  interface IdempotencyRecord {
    actorId: string;
    key: string;
    operation: string;
    requestHash: string;
    ticketId: string;
    createdAt: Date;
  }
  interface IdempotencyRepository {
    find(actorId: string, key: string): Promise<IdempotencyRecord | undefined>;
    save(record: IdempotencyRecord): Promise<void>;
  }
  interface TicketStore {
    tickets: TicketRepository;
    idempotency: IdempotencyRepository;
  }
  interface UnitOfWork {
    run<T>(work: (store: TicketStore) => Promise<T>): Promise<T>;
  }
  interface Clock {
    now(): Date;
  }
  class IdempotencyKeyTakenError extends Error {}
  ```

- Produces (tabelas): `tickets` (colunas do design doc, seção 6; `item` e `resolved_at` anuláveis; enums como `text` com `CHECK` nos valores do domínio; índice em `(requester_id, last_update_at desc)`), `ticket_events` (`id` identity, `ticket_id` FK, `kind`, `actor_id`, `payload jsonb`, `created_at`), `idempotency_keys` (PK `(actor_id, key)`, `operation`, `request_hash`, `ticket_id`, `created_at`), sequências `inc_ticket_number_seq` (início 20400) e `req_ticket_number_seq` (início 10500). Todas as datas `timestamptz`.
- Produces: `createDatabase(url: string): { db: NodePgDatabase; pool: Pool; checkReadiness(): Promise<boolean> }`; `createDrizzleUnitOfWork(db)`; `createDrizzleTicketRepository(db)` para leituras fora de transação.
- Mapeamento linha → `Ticket`: `null` vira propriedade ausente (`exactOptionalPropertyTypes`), nunca `item: undefined`.
- `IdempotencyRepository.save` lança `IdempotencyKeyTakenError` quando o Postgres devolve violação de unicidade (`23505`).
- `migrate.ts`: aplica as migrações da pasta com o migrator do Drizzle e encerra; scripts `db:generate` e `db:migrate` no `package.json`.
- `postgres-container.ts`: `startPostgres(): Promise<{ url: string; stop(): Promise<void> }>` com `PostgreSqlContainer('postgres:18-alpine')`, já com migrações aplicadas.

- [ ] **Step 1: Escrever os testes que falham** (um container por arquivo, `beforeAll`/`afterAll`):
  - `insert` + `findById` devolve o mesmo chamado; um chamado sem `item` volta sem a propriedade `item`;
  - `nextId('INC')` devolve `INC-20400` e depois `INC-20401`; `nextId('REQ')` devolve `REQ-10500`;
  - `list({ requesterId, limit: 2 })` traz só daquele solicitante, ordenado por `lastUpdateAt` desc, no máximo 2; `list({ status: 'RESOLVED', limit: 50 })` filtra por status;
  - um `unitOfWork.run` que insere e depois lança erro não deixa o chamado gravado (rollback);
  - `idempotency.save` com a mesma `(actorId, key)` duas vezes lança `IdempotencyKeyTakenError`;
  - **concorrência:** duas transações que fazem `findByIdForUpdate` no mesmo chamado executam em série (a segunda só lê depois do commit da primeira e vê o status já alterado).
- [ ] **Step 2: Rodar** `pnpm test drizzle-ticket-store`. Esperado: FAIL.
- [ ] **Step 3: Implementar** o schema, gerar a migração com `pnpm --filter @nexo/ticket-service db:generate` e implementar os adaptadores.
- [ ] **Step 4: Rodar** `pnpm test --coverage && pnpm typecheck && pnpm lint`. Esperado: PASS.
- [ ] **Step 5: Commit e push:** `feat(ticket-service): persist tickets with Drizzle and Postgres`.

### Task 5: Casos de uso de leitura e regras de acesso

**Files:**

- Create: `apps/ticket-service/src/application/access/{actor.ts,access-policy.ts}`
- Create: `apps/ticket-service/src/application/views/ticket-view.ts`
- Create: `apps/ticket-service/src/application/use-cases/{list-tickets.ts,get-ticket.ts,search-duplicates.ts}`
- Test: `apps/ticket-service/test/support/{in-memory-ticket-store.ts,fixed-clock.ts,ticket-builder.ts}`, `apps/ticket-service/test/application/{access-policy,list-tickets,get-ticket,search-duplicates}.test.ts`

**Interfaces:**

- Consumes: portas da Task 4; `isOverdue`, `computeDueAt`, `findDuplicateCandidates` do domínio.
- Produces: `interface Actor { id: string; role: UserRole }`
- Produces: `resolveRequesterScope(actor: Actor, requestedRequesterId?: string): string | undefined` (funcionário: devolve o próprio id ou lança `ForbiddenError` se pedir outro; analista: devolve o que pediu) e `assertCanRead(actor: Actor, ticket: Ticket | undefined): Ticket` (lança `NotFoundError` se não existe ou não é dele, para funcionário).
- Produces: `type TicketView = Ticket & { dueAt: Date; overdue: boolean }` e `toTicketView(ticket: Ticket, now: Date): TicketView`.
- Produces: `listTickets(deps: { tickets: TicketRepository; clock: Clock }, actor: Actor, query: ListTicketsQuery): Promise<TicketView[]>`
- Produces: `getTicket(deps, actor: Actor, id: string): Promise<TicketView>`
- Produces: `searchDuplicates(deps, actor: Actor, query: DuplicateSearchQuery): Promise<Array<{ ticket: TicketView; similarity: number; action: DuplicateAction }>>`, buscando até 100 chamados do solicitante resolvido por `resolveRequesterScope`; analista sem `requesterId` recebe `ValidationError`.
- `in-memory-ticket-store.ts` implementa `TicketRepository`, `IdempotencyRepository` e `UnitOfWork` em memória (rollback descartando uma cópia), com o mesmo comportamento de `IdempotencyKeyTakenError`.

- [ ] **Step 1: Escrever os testes que falham:**
  - Ana lista e recebe só os chamados dela; Ana pedindo `requesterId` do Bruno → `ForbiddenError`; analista sem `requesterId` recebe os de todos;
  - Ana pedindo o id de um chamado do Bruno → `NotFoundError` (igual a um id inexistente); analista recebe o chamado do Bruno;
  - `TicketView` de um chamado MEDIUM atualizado em `2026-12-09T17:20:00Z`, com relógio em `2026-12-14T17:21:00Z`, tem `dueAt` `2026-12-14T17:20:00Z` e `overdue: true`;
  - `searchDuplicates` da Ana não inclui chamados de outra pessoa mesmo com título idêntico.
- [ ] **Step 2: Rodar** `pnpm test application`. Esperado: FAIL.
- [ ] **Step 3: Implementar** os arquivos acima.
- [ ] **Step 4: Rodar** `pnpm test --coverage && pnpm typecheck && pnpm lint`. Esperado: PASS.
- [ ] **Step 5: Commit e push:** `feat(ticket-service): read tickets with ownership checks`.

### Task 6: Casos de uso de escrita e idempotência

**Files:**

- Create: `apps/ticket-service/src/application/idempotency/with-idempotency.ts`
- Create: `apps/ticket-service/src/application/use-cases/{create-ticket.ts,add-ticket-info.ts,reopen-ticket.ts,change-ticket-status.ts}`
- Test: `apps/ticket-service/test/application/{with-idempotency,create-ticket,add-ticket-info,reopen-ticket,change-ticket-status}.test.ts`

**Interfaces:**

- Consumes: `validateTicketDraft`, `canReopen`, `canChangeStatus`, `statusChangeEventKind` do domínio; portas da Task 4; acesso e views da Task 5.
- Produces: `interface IdempotencyContext { key: string; requestHash: string }` e `interface WriteResult { ticket: TicketView; replayed: boolean }`.
- Produces: `withIdempotency(deps: { unitOfWork: UnitOfWork; tickets: TicketRepository; clock: Clock }, actor: Actor, operation: string, context: IdempotencyContext, work: (store: TicketStore) => Promise<string>): Promise<WriteResult>`. Algoritmo:

  ```
  dentro de unitOfWork.run:
    registro = store.idempotency.find(actor.id, key)
    se existe: operação ou hash diferentes → ConflictError(IDEMPOTENCY_KEY_REUSED)
               senão → replay (relê o chamado registro.ticketId)
    ticketId = work(store)
    store.idempotency.save({ actorId, key, operation, requestHash, ticketId, createdAt: now })
  se save lançar IdempotencyKeyTakenError (corrida com outra requisição igual):
    a transação já foi desfeita; repetir a busca uma vez fora dela e responder como replay
  ```

- Produces: `createTicket(deps, actor, request: CreateTicketRequest, context): Promise<WriteResult>`: só `EMPLOYEE` (analista → `ForbiddenError`); usa `validateTicketDraft` para a prioridade; `nextId(type)`; status `OPEN`; `createdAt = lastUpdateAt = now`; evento `CREATED`.
- Produces: `addTicketInfo(deps, actor, id, request: AddTicketInfoRequest, context)`: dono ou analista; chamado `RESOLVED` → `ConflictError(TICKET_RESOLVED)`; atualiza `lastUpdateAt`; evento `INFO_ADDED` com a mensagem no `payload`.
- Produces: `reopenTicket(deps, actor, id, request: ReopenTicketRequest, context)`: só o dono; `!canReopen` → `ConflictError(REOPEN_NOT_ALLOWED)`; status `OPEN`, remove `resolvedAt`, atualiza `lastUpdateAt`; evento `REOPENED`.
- Produces: `changeTicketStatus(deps, actor, id, request: ChangeTicketStatusRequest, context)`: só `ANALYST`; `!canChangeStatus` → `ConflictError(INVALID_STATUS_TRANSITION)`; `RESOLVED` grava `resolvedAt = now`; evento de `statusChangeEventKind`.
- Toda escrita lê o chamado com `findByIdForUpdate` dentro da transação.

- [ ] **Step 1: Escrever os testes que falham** (store em memória, relógio fixo):
  - Ana cria um chamado `SELF` + `SAME_DAY_COMMITMENT` → `INC-20400`, prioridade `HIGH`, status `OPEN`, `requesterId` da Ana, um evento `CREATED`;
  - mesma chave e mesmo hash de novo → `replayed: true`, mesmo id, ainda só 1 chamado; mesma chave com outro hash → `IDEMPOTENCY_KEY_REUSED`; mesma chave usada em `addTicketInfo` → `IDEMPOTENCY_KEY_REUSED`;
  - corrida: um store em memória cujo `save` lança `IdempotencyKeyTakenError` na primeira chamada, com o registro já gravado por "outra requisição" → resultado `replayed: true` sem segundo chamado;
  - analista tentando criar → `ForbiddenError`;
  - `addTicketInfo` em chamado resolvido → `TICKET_RESOLVED`; em chamado aberto atualiza `lastUpdateAt` para `now`;
  - `reopenTicket` 3 dias após resolver → `OPEN` sem `resolvedAt`; 8 dias após → `REOPEN_NOT_ALLOWED`; Bruno reabrindo chamado da Ana → `NotFoundError`;
  - `changeTicketStatus` para `RESOLVED` grava `resolvedAt` e evento `RESOLVED`; para o mesmo status → `INVALID_STATUS_TRANSITION`; funcionário tentando → `ForbiddenError`.
- [ ] **Step 2: Rodar** `pnpm test application`. Esperado: FAIL.
- [ ] **Step 3: Implementar** os arquivos acima.
- [ ] **Step 4: Rodar** `pnpm test --coverage && pnpm typecheck && pnpm lint`. Esperado: PASS.
- [ ] **Step 5: Commit e push:** `feat(ticket-service): write tickets with idempotency keys`.

### Task 7: Rotas HTTP e autenticação de serviço

**Files:**

- Create: `apps/ticket-service/src/adapters/http/middleware/{service-auth.ts,actor-context.ts,idempotency-context.ts}`
- Create: `apps/ticket-service/src/adapters/http/routes/ticket-routes.ts`
- Create: `apps/ticket-service/src/adapters/http/mappers/ticket-response-mapper.ts`
- Modify: `apps/ticket-service/src/adapters/http/app.ts`, `apps/ticket-service/src/main.ts`
- Test: `apps/ticket-service/test/adapters/http/ticket-routes.test.ts` (Postgres real via Testcontainers)

**Interfaces:**

- Consumes: casos de uso das Tasks 5 e 6; schemas de `@nexo/contracts`.
- Produces: `AppDependencies` ampliado com `apiToken: string`, `tickets: TicketRepository`, `unitOfWork: UnitOfWork`, `clock: Clock`.
- `service-auth`: compara o Bearer com `crypto.timingSafeEqual` (tamanhos diferentes → 401 sem comparar).
- `actor-context`: valida os headers com `ActorHeadersSchema` e guarda o `Actor` no contexto do Hono.
- `idempotency-context`: em `POST`, exige `Idempotency-Key` válida e calcula `requestHash = sha256(método + ' ' + rota + '\n' + corpo bruto)`.
- `bodyLimit` de 64 KB nas rotas `/tickets*` → 413 `PAYLOAD_TOO_LARGE`.
- `ticket-response-mapper`: `TicketView` → `TicketResponse` (datas com `toISOString()`, sem propriedades ausentes virando `null`).
- Ordem das rotas: `/tickets/duplicates` registrada antes de `/tickets/:id`; `:id` validado com `TicketIdSchema`.

- [ ] **Step 1: Escrever os testes que falham** (container + app com relógio fixo; requisições com `app.request`):
  - sem `Authorization` → 401; token errado → 401; sem `X-Actor-Role` → 400;
  - Ana: `POST /tickets` → 201, corpo validado por `TicketResponseSchema`; reenviado com a mesma chave → 201 de novo (o replay repete o status original), mesmo `id` e `Idempotent-Replayed: true`, e `GET /tickets` da Ana continua com 1 chamado novo; **duas requisições simultâneas** com a mesma chave (`Promise.all`) → mesmo `id`, 1 chamado gravado;
  - `POST /tickets` sem `Idempotency-Key` → 400; com `category: 'HR'` → 400 `VALIDATION_FAILED`; corpo de 70 KB → 413;
  - Ana: `GET /tickets/<id do Bruno>` → 404; `GET /tickets?requesterId=<Bruno>` → 403; `GET /tickets/inc-1` → 400;
  - analista: `POST /tickets/:id/status` `{ status: 'RESOLVED' }` → 200 com `resolvedAt`; Ana fazendo o mesmo → 403;
  - Ana: `POST /tickets/:id/reopen` logo depois → 200 com status `OPEN`;
  - `GET /tickets/duplicates?category=NETWORK_VPN&summary=VPN não conecta` → lista validada por `DuplicateCandidateResponseSchema`.
- [ ] **Step 2: Rodar** `pnpm test ticket-routes`. Esperado: FAIL.
- [ ] **Step 3: Implementar** middlewares, rotas, mapper, e ligar tudo no `createApp` e no `main.ts`.
- [ ] **Step 4: Rodar** `pnpm test --coverage && pnpm typecheck && pnpm lint && pnpm format:check`. Esperado: PASS.
- [ ] **Step 5: Commit e push:** `feat(ticket-service): expose ticket HTTP API with service auth`.

### Task 8: Injeção de falhas

**Files:**

- Create: `apps/ticket-service/src/adapters/http/middleware/failure-injection.ts`
- Modify: `apps/ticket-service/src/adapters/http/app.ts`, `apps/ticket-service/src/main.ts`
- Test: `apps/ticket-service/test/adapters/http/failure-injection.test.ts`

**Interfaces:**

- Produces: `failureInjection(options: { rate: number; extraLatencyMs: number; random?: () => number; sleep?: (ms: number) => Promise<void> }): MiddlewareHandler`. Primeiro espera `extraLatencyMs`; depois, se `random() < rate`, responde 503 `SERVICE_UNAVAILABLE` **sem chamar o handler**. Com `rate: 0` e `extraLatencyMs: 0` não faz nada.
- Aplicado só em `/tickets*`, depois da autenticação (requisição sem token continua dando 401, não 503).
- `main.ts` registra um `warn` no log ao iniciar quando `FAILURE_RATE > 0` ou `EXTRA_LATENCY_MS > 0`.

- [ ] **Step 1: Escrever os testes que falham** (store em memória):
  - `random` fixo em `0.1` com `rate: 0.5` → 503; com `rate: 0.05` → passa;
  - um `POST /tickets` com falha injetada não grava nada (a lista continua vazia);
  - `/health` e `/ready` nunca recebem falha, mesmo com `rate: 1`;
  - `extraLatencyMs: 300` chama `sleep(300)` uma vez;
  - sem token, com `rate: 1` → 401.
- [ ] **Step 2: Rodar** `pnpm test failure-injection`. Esperado: FAIL.
- [ ] **Step 3: Implementar** e ligar no app a partir de `FAILURE_RATE` e `EXTRA_LATENCY_MS`.
- [ ] **Step 4: Rodar** `pnpm test --coverage && pnpm typecheck && pnpm lint`. Esperado: PASS.
- [ ] **Step 5: Commit e push:** `feat(ticket-service): inject configurable failures to simulate the legacy system`.

### Task 9: Seed (Anexo B)

**Files:**

- Create: `apps/ticket-service/src/seed/{seed-users.ts,seed-tickets.ts,seed.ts,run-seed.ts}`
- Test: `apps/ticket-service/test/seed/seed.test.ts`

**Interfaces:**

- Produces: `SEED_USERS` (o Plano 3 reaproveita estes ids no banco da API):

  | id                                     | Nome            | Papel    | Departamento |
  | -------------------------------------- | --------------- | -------- | ------------ |
  | `00000000-0000-4000-8000-000000000001` | Ana Souza       | EMPLOYEE | Financeiro   |
  | `00000000-0000-4000-8000-000000000002` | Bruno Lima      | EMPLOYEE | Comercial    |
  | `00000000-0000-4000-8000-000000000003` | Carla Mendes    | EMPLOYEE | RH           |
  | `00000000-0000-4000-8000-000000000004` | Diego Rocha     | EMPLOYEE | Marketing    |
  | `00000000-0000-4000-8000-000000000005` | Elisa Prado     | EMPLOYEE | Jurídico     |
  | `00000000-0000-4000-8000-000000000006` | Felipe Nunes    | EMPLOYEE | Operações    |
  | `00000000-0000-4000-8000-000000000101` | Gabriela Torres | ANALYST  | TI           |
  | `00000000-0000-4000-8000-000000000102` | Henrique Alves  | ANALYST  | TI           |

- Produces: `buildSeedTickets(now: Date): Ticket[]`, com datas relativas a `now` e prioridade sempre de `computePriority`:

  | id          | Solicitante | Tipo | Categoria (item)    | Título                         | Impacto + urgência         | Status          | Datas relativas a `now`  | Situação esperada |
  | ----------- | ----------- | ---- | ------------------- | ------------------------------ | -------------------------- | --------------- | ------------------------ | ----------------- |
  | `INC-20311` | Ana         | INC  | NETWORK_VPN         | VPN não conecta (erro 809)     | SELF + SAME_DAY_COMMITMENT | IN_PROGRESS     | atualizado há 7 dias     | vencido           |
  | `REQ-10442` | Ana         | REQ  | ACCESS              | Acesso à pasta do Financeiro   | SELF + NO_URGENCY          | OPEN            | atualizado há 1 hora     | no prazo          |
  | `INC-20298` | Ana         | INC  | EMAIL               | Outlook não sincroniza         | SELF + HAS_WORKAROUND      | RESOLVED        | resolvido há 2 dias      | pode reabrir      |
  | `INC-20250` | Ana         | INC  | HARDWARE (Notebook) | Teclado do notebook falhando   | SELF + HAS_WORKAROUND      | RESOLVED        | resolvido há 20 dias     | não pode reabrir  |
  | `INC-20320` | Bruno       | INC  | NETWORK_VPN         | VPN caiu para o time comercial | TEAM + BLOCKED             | WAITING_ANALYST | atualizado há 30 minutos | crítico, no prazo |
  | `REQ-10450` | Bruno       | REQ  | SOFTWARE (Figma)    | Instalação do Figma            | SELF + HAS_WORKAROUND      | APPROVED        | atualizado há 7 dias     | vencido           |
  | `INC-20305` | Carla       | INC  | SOFTWARE            | Sistema de folha lento         | TEAM + HAS_WORKAROUND      | IN_PROGRESS     | atualizado há 1 hora     | no prazo          |
  | `INC-20290` | Diego       | INC  | OTHER (Projetor)    | Projetor da sala 3 sem imagem  | SELF + NO_URGENCY          | OPEN            | atualizado há 2 horas    | no prazo          |

  `createdAt` = `lastUpdateAt` − 1 dia (ou `resolvedAt` − 1 dia para resolvidos); descrições curtas e realistas, em português.

- Produces: `seedTickets(unitOfWork: UnitOfWork, now: Date): Promise<void>`: idempotente, faz upsert por `id` (rodar de novo atualiza as datas relativas) e grava um evento `CREATED` só na primeira vez.
- `run-seed.ts`: carrega o env, roda `seedTickets` com `new Date()`, fecha o pool. Script `db:seed`. Nunca roda automaticamente ao subir o serviço.

- [ ] **Step 1: Escrever os testes que falham:**
  - com `now` numa segunda às 09:00 **e** num sábado às 15:00 (`it.each`), cada chamado da tabela tem a situação esperada: `isOverdue` verdadeiro só para `INC-20311` e `REQ-10450`; `canReopen` verdadeiro para `INC-20298` e falso para `INC-20250`;
  - todo `requesterId` existe em `SEED_USERS` com papel `EMPLOYEE`;
  - (Postgres) rodar `seedTickets` duas vezes deixa exatamente 8 chamados.
- [ ] **Step 2: Rodar** `pnpm test seed`. Esperado: FAIL.
- [ ] **Step 3: Implementar** os arquivos acima.
- [ ] **Step 4: Rodar** `pnpm test --coverage && pnpm typecheck && pnpm lint`. Esperado: PASS.
- [ ] **Step 5: Commit e push:** `feat(ticket-service): seed Annex B tickets relative to the current time`.

### Task 10: Docker, Compose e CI

**Files:**

- Create: `apps/ticket-service/Dockerfile`, `.dockerignore`
- Create: `infra/docker-compose.yml`, `infra/postgres/init/01-create-databases.sh`
- Create: `.env.example`
- Modify: `package.json` (scripts `infra:up`, `infra:down`, `infra:logs`), `apps/ticket-service/package.json` (script `build`), `.github/workflows/ci.yml`, `README.md` (seção "Rodando localmente")

**Interfaces:**

- Script `build` do serviço: esbuild de `src/main.ts`, `src/migrate.ts` e `src/seed/run-seed.ts` para `dist/`, com `--bundle --platform=node --format=esm --target=node26 --external:pg-native` (o bundle inclui `@nexo/domain` e `@nexo/contracts`, que são `.ts` e não rodariam dentro de `node_modules`).
- `Dockerfile` multi-stage:
  - **build:** `node:26-slim`, `corepack enable`, `pnpm install --frozen-lockfile --filter @nexo/ticket-service...`, `pnpm --filter @nexo/ticket-service build`;
  - **runtime:** `node:26-slim` com só `dist/` e a pasta de migrações, `NODE_ENV=production`, `USER node`, `EXPOSE 4001`, `CMD ["node", "dist/main.js"]`. Sem `node_modules` (o bundle já inclui tudo).
- `.dockerignore`: `node_modules`, `.git`, `.env*` (exceto `.env.example`), `coverage`, `dist`, `docs`, `*.pdf`, `.superpowers`, `.playwright-mcp`.
- `01-create-databases.sh` (`set -euo pipefail`): cria os papéis `nexo_tickets_app` e `nexo_api_app` com senhas de `TICKETS_DB_PASSWORD` e `API_DB_PASSWORD`, cria `nexo_tickets` e `nexo_api` com cada papel como dono, e `REVOKE CONNECT ... FROM PUBLIC` nos dois.
- `docker-compose.yml`:
  - `postgres`: `postgres:18-alpine`, `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?}`, volume `pgdata`, init montado como somente leitura, porta `127.0.0.1:5432:5432`, healthcheck `pg_isready`;
  - `ticket-service-migrate`: mesma imagem, `command: ["node", "dist/migrate.js"]`, `depends_on: postgres (service_healthy)`, `restart: "no"`;
  - `ticket-service`: `depends_on: ticket-service-migrate (service_completed_successfully)`, porta `127.0.0.1:4001:4001`, `read_only: true`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, healthcheck com `node -e` fazendo `fetch` em `/ready`;
  - variáveis obrigatórias com `${VAR:?}`: o Compose recusa subir sem elas.
- `.env.example`: `POSTGRES_PASSWORD`, `TICKETS_DB_PASSWORD`, `API_DB_PASSWORD`, `TICKET_SERVICE_API_TOKEN`, `FAILURE_RATE=0`, `EXTRA_LATENCY_MS=0`, `LOG_LEVEL=info`, com valores de exemplo claramente falsos (`change-me-...`) e o comando para gerar o token (`openssl rand -hex 32`) no README.
- Scripts raiz: `infra:up` = `docker compose --env-file .env -f infra/docker-compose.yml up -d --build`, `infra:down` e `infra:logs` equivalentes.
- CI: novo passo `docker build -f apps/ticket-service/Dockerfile .` depois dos testes (os testes com Testcontainers já usam o Docker do runner `ubuntu-latest`).

- [ ] **Step 1: Subir o ambiente:** `cp .env.example .env`, preencher senhas e token, `pnpm infra:up`. Esperado: `docker compose ps` mostra `postgres` e `ticket-service` saudáveis e `ticket-service-migrate` encerrado com código 0.
- [ ] **Step 2: Verificar de fora:** `curl -s localhost:4001/ready` → `{"status":"ok"}`; `pnpm --filter @nexo/ticket-service db:seed` com `DATABASE_URL` apontando para `127.0.0.1`; `curl` em `GET /tickets` com o token e os headers da Ana → os 4 chamados dela, com `INC-20311` `overdue: true`.
- [ ] **Step 3: Verificar o isolamento:** `psql` como `nexo_tickets_app` tentando conectar em `nexo_api` → recusado; `docker compose exec ticket-service id` → usuário `node`, não `root`.
- [ ] **Step 4: Rodar** `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test --coverage && pnpm audit --audit-level=high && docker build -f apps/ticket-service/Dockerfile .`. Esperado: tudo PASS.
- [ ] **Step 5: Commit e push:** `build(infra): run ticket service and Postgres with Docker Compose`. Fabiano abre o PR de `feat/ticket-service`.
