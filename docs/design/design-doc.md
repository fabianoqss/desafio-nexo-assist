# Nexo Assist: Design Document

| | |
|---|---|
| Status | Approved for implementation |
| Date | 2026-11-19 |
| Author | Fabiano |
| Source | Challenge PRD v5 (Annex A: service desk rules, Annex B: sample data, Annex C: Pencil prototype) |

## 1. Context and goals

Nexo (about 2,000 employees) opens IT tickets through a form, which leads to tickets for questions the help center already answers, duplicates, wrong priorities, missing information, and analysts spending most of the day on triage.

**Nexo Assist** is a chat agent. The employee describes the problem in their own words; the agent checks their tickets, searches the help center, opens or updates tickets, and hands off to an analyst when needed.

### Success criteria (from the PRD)

| Criterion | How the design addresses it | Metric |
|---|---|---|
| Resolution without a queue | Help center search and ticket lookups answered in the chat | `% conversations resolved by the agent` |
| Well-formed tickets | Draft + confirmation; priority computed by domain rules; duplicate check | `tickets created`, `duplicates avoided` |
| Right routing | Handoff on request, critical cases, overdue tickets, or low confidence; summary attached | `handoffs by reason`, `handoff wait time` |
| Transparency | A decision record per turn, shown as chips plus an expandable detail panel | `average confidence`, decision records stored |

### Non-goals

- Real identity provider (SSO/OIDC). Login accepts any password for seeded employees, as the PRD requires.
- Admin role, user management, settings screens.
- Real legacy integration. The ticket service is simulated.
- Embedding-based search (see trade-offs).
- Mobile layouts beyond basic responsiveness.

## 2. Decisions on gaps between the PRD and the prototype

| Gap | Decision | Reason |
|---|---|---|
| Analyst login | Same login screen. Roles `EMPLOYEE` and `ANALYST` come from seed data; the backend enforces them on every request | Simpler, mirrors real systems, demonstrates RBAC |
| Admin role | Not included | No requirement needs it (YAGNI); the role model allows adding it later |
| Handoff not picked up in time | Conversation stays waiting; the console flags it as overdue; the agent never takes it back automatically | PRD: the agent does not reply while the conversation is with an analyst |
| Handoff deadline ("2 h úteis" in the prototype) | Follows Annex A: the handoff uses the ticket priority deadline | Annex A holds the rules; prototype data is illustrative |
| Handoff without a ticket | The agent classifies impact and urgency, the domain computes the priority; fallback is `MEDIUM` | One rule for every case; analysts can always sort by priority |
| Agent confidence ("confiança 41%") | Hybrid: the LLM reports a structured confidence, deterministic domain rules lower it; below a configurable threshold (default `0.6`) the agent hands off | LLM self-reported confidence is poorly calibrated; rules make it testable |
| Subcategory ("Hardware › Notebook") | Only the 6 Annex A categories as a fixed type, plus an optional free-text `item` | Strict to Annex A, keeps the prototype look |
| Login screen statistics | Computed from real data by a public endpoint that returns aggregates only, cached and rate-limited | Business metrics on screen, same numbers as Prometheus |
| "Meu perfil" screen (prototype only) | Implemented read-only; "reset password" shows a non-functional notice | Low cost, faithful to the prototype |

## 3. Architecture

```
┌──────────────┐  HTTPS + SSE   ┌──────────────────────────────┐  HTTP   ┌──────────────────┐
│  apps/web    │ ─────────────► │  apps/api                    │ ──────► │ apps/ticket-     │
│  React SPA   │                │  auth · chat · console       │         │ service          │
│  (chat +     │ ◄───────────── │  Mastra agent + tools        │ ◄────── │ simulated legacy │
│  console)    │                │  uses packages/domain        │         │ uses domain      │
└──────────────┘                └──────────────┬───────────────┘         └────────┬─────────┘
                                               │                                  │
                                         ┌─────▼─────┐                     ┌──────▼──────┐
                                         │ nexo_api  │                     │ nexo_tickets│
                                         │ Postgres  │                     │ Postgres    │
                                         └───────────┘                     └─────────────┘
                                               │ LLM provider (config): Claude Haiku 5.5 default
```

### Monorepo layout

```
apps/
  web/              React + Vite + Tailwind
  api/              Node (Hono), auth, chat, console, Mastra agent
  ticket-service/   simulated legacy ticket system, own HTTP API and database
packages/
  domain/           Annex A rules: pure TypeScript, no framework, no I/O
  contracts/        Zod schemas and types shared over HTTP
infra/
  docker-compose.yml, Grafana dashboards, Prometheus config, OTel collector config
docs/
  design/           this document
```

Tooling: pnpm workspaces, TypeScript `strict`, ESLint, Prettier, Vitest.

### Layering inside `api` and `ticket-service`

Hexagonal style: `domain` (entities and rules from `packages/domain`) → `application` (use cases) → `adapters` (`http`, `persistence`, `llm`, `ticket-client`). Infrastructure is swappable by configuration: database, LLM provider, identity provider.

### Key technology choices

| Concern | Choice | Alternative considered |
|---|---|---|
| Frontend | React + Vite SPA, Tailwind, TanStack Query, React Router | Next.js: mixes UI and backend, more framework magic, streaming long agent turns fits less naturally |
| Backend HTTP | Hono | Fastify: also good; Hono is smaller and has first-class SSE helpers |
| Agent | Mastra (PRD preference) on top of AI SDK providers | LangGraph.js |
| Database | Postgres with Drizzle ORM, one database per service | SQLite: simpler, but weaker for concurrent console use and deploy |
| Validation | Zod at every boundary (HTTP, tool inputs, LLM structured output) | |
| LLM | Claude Haiku 5.5 by default, set via `LLM_MODEL` | Gemini 3.5 Flash-Lite, DeepSeek (compared in evals) |

## 4. Domain rules (`packages/domain`)

Pure functions and types, fully unit-tested. Implemented by Fabiano.

- **Types:** `TicketType` (`INC`, `REQ`), `Category` (`ACCESS`, `NETWORK_VPN`, `HARDWARE`, `SOFTWARE`, `EMAIL`, `OTHER`), `Impact` (`SELF`, `TEAM`, `COMPANY`), `Urgency` (`SAME_DAY_COMMITMENT`, `BLOCKED`, `HAS_WORKAROUND`, `NO_URGENCY`), `Priority` (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), `TicketStatus`.
- **Priority matrix:** `computePriority(impact, urgency, type)`.
  - `CRITICAL`: something is down for a team or the whole company.
  - `HIGH`: one person cannot work, or a same-day commitment is at risk.
  - `MEDIUM`: it gets in the way but there is a workaround.
  - `LOW`: requests and improvements with no urgency.
- **Deadlines:** `computeDueAt(priority, from, calendar)`. Critical is 1 hour, 24/7 (on-call). High is 4 business hours, Medium 3 business days, Low 5 business days. Business hours are Monday to Friday, 08:00–18:00, `America/Sao_Paulo`. The deadline applies to the first response and to each update.
- **Overdue:** `isOverdue(ticket, now)`, computed, never stored.
- **Duplicates:** `findDuplicateCandidates(newIssue, tickets)`: an open ticket in the same category with a similar subject means update instead of create.
- **Reopen:** `canReopen(ticket, now)`: resolved within the last 7 days.
- **Ticket completeness:** `validateTicketDraft(draft)`: title, description, type, category, priority and who is affected are all required.
- **Scope:** IT only; HR, finance and facilities are redirected.
- **Confidence adjustment:** `adjustConfidence(llmConfidence, ruleChecks)` lowers the score and returns the reasons.

## 5. Agent design

### Turn flow

1. The API authenticates the session and loads the conversation.
2. If the status is not `WITH_AGENT`, the message is stored and **no LLM call is made**.
3. If the session reached 30 messages, input is blocked and a handoff is offered.
4. The Mastra agent runs with the tools below and the conversation memory.
5. The answer streams over SSE; tool calls stream as chips.
6. A decision record is saved and exported as OpenTelemetry spans and metrics.

### Tools

| Tool | Purpose | UI chip |
|---|---|---|
| `searchHelpCenter(query)` | Full-text search over help articles | "buscou na central de ajuda" |
| `listMyTickets(status?)` | The logged-in employee's tickets only | "consultou seus chamados" |
| `getTicket(id)` | Ticket details, only if owned by the employee | "consultou o INC-20311" |
| `findDuplicates(category, summary)` | Open tickets, or tickets resolved within 7 days, about the same issue | "verificou duplicidade" |
| `prepareTicketDraft(...)` | Builds a draft from extracted fields; does not create the ticket | "montou o rascunho" |
| `prepareTicketUpdate(id, info)` | Draft to update or reopen a ticket | "preparou a atualização" |
| `requestHandoff(reason, summary)` | Transfers the conversation with a case summary | "chamou um analista" |

### Safety by design

1. **Identity never comes from the LLM.** Tools receive the employee from the server-side request context. Tool arguments cannot select another user, so prompt injection cannot leak another employee's tickets.
2. **The LLM cannot create or change tickets.** It only prepares drafts. The Confirm button calls `POST /drafts/:id/confirm` directly, so a ticket only exists after a human click.
3. **The LLM does not decide the priority.** It extracts impact and urgency; `packages/domain` computes priority and deadline.
4. **Minimal data to the provider.** Only the current employee's data needed for the turn is sent; no secrets or other users' data.

### Decision record

Each agent turn stores:

```ts
type Decision = {
  intent: Intent;
  action: Action;
  steps: ToolStep[];
  ruleChecks: RuleCheck[];
  confidence: number;
  confidenceReasons: string[];
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
};
```

The UI shows each step as a chip above the reply. Clicking it expands intent, action, rules applied, and confidence with reasons. Analysts see the same panel in the console.

### Handoff triggers

The employee asks for it; the case is critical; a ticket is overdue; or adjusted confidence is below the threshold. Each handoff carries a reason, a summary written by the agent, a priority, and a due time.

### Unreliable ticket service

The API's ticket client uses a timeout, retry with exponential backoff and jitter (idempotency keys on writes), and a circuit breaker. When it is still unavailable, the agent says so, keeps the draft, and the decision record shows the failure. The ticket service has a configurable failure-injection rate to simulate the legacy system.

## 6. Data model

### `nexo_tickets` (owned by ticket-service)

| Table | Fields |
|---|---|
| `tickets` | `id` (`INC-20311`, `REQ-10442`), `type`, `title`, `description`, `category`, `item?`, `impact`, `urgency`, `priority`, `status`, `requester_id`, `created_at`, `last_update_at`, `resolved_at?` |
| `ticket_events` | `ticket_id`, `kind` (created, updated, info_added, reopened, transferred, assumed, resolved), `payload`, `actor`, `created_at` |

Ticket status: `OPEN`, `IN_PROGRESS`, `WAITING_ANALYST`, `APPROVED`, `RESOLVED`.

### `nexo_api` (owned by api)

| Table | Fields |
|---|---|
| `users` | `id`, `name`, `email`, `department`, `role` |
| `conversations` | `employee_id`, `status` (`WITH_AGENT`, `WAITING_ANALYST`, `WITH_ANALYST`, `CLOSED`), `assigned_analyst_id?`, `handoff_reason?`, `handoff_summary?`, `handoff_priority?`, `handoff_due_at?`, `message_count` |
| `messages` | `conversation_id`, `author` (`EMPLOYEE`, `AGENT`, `ANALYST`, `SYSTEM`), `content`, `created_at` |
| `decisions` | `message_id` and the fields of the decision record |
| `ticket_drafts` | `id` (`D-381`), `conversation_id`, `kind` (`CREATE`, `UPDATE`, `REOPEN`), `payload`, `status` (`PENDING`, `CONFIRMED`, `CANCELLED`) |
| `help_articles` | `title`, `body`, `tags`, full-text search index |

Mastra memory lives in its own schema in `nexo_api`. Conversations, tickets and conversation state survive restarts; "come back another day" reloads the conversation and its thread.

### Seed data (Annex B)

About 6 employees, 2 analysts, 5–10 help articles (including the VPN error 809 and service hours articles), and tickets in varied states: open, overdue, recently resolved, and belonging to other employees.

## 7. API surface (summary)

| Method and path | Role | Purpose |
|---|---|---|
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | any | Session cookie |
| `GET /public/stats` | none | Aggregates for the login screen (cached, rate-limited) |
| `GET /conversations/current`, `POST /conversations/:id/messages` (SSE) | employee | Chat |
| `POST /drafts/:id/confirm`, `POST /drafts/:id/cancel` | employee | Confirm or cancel a draft |
| `GET /console/conversations?filter=` (+ SSE stream) | analyst | Console list |
| `POST /console/conversations/:id/assume`, `/return`, `/close`, `/messages` | analyst | Take over, return to agent, close, reply |
| `GET /console/employees/:id/tickets` | analyst | Employee ticket panel |

## 8. User interface

Follows the Pencil prototype: navy `#1B2431`, blue `#0062C4`, light theme, UI font plus a display font for headings, configured as Tailwind tokens.

Screens: Login, Chat (new ticket, ticket lookup, handoff), Analyst console (list with filters "Todas / Para você / Com o agent / Minhas", transferred conversation, conversation in progress, employee ticket panel), and Meu perfil.

Chat details: streaming replies, action chips, numbered quick replies, ticket selection list, ticket card with overdue badge, draft card with Confirm / Edit / Cancel (⌘↵), and a "n/30 mensagens" counter. Every screen has loading, empty and error states. Routes are protected by role.

## 9. Security

- Session as an httpOnly, Secure, SameSite=Lax cookie; CSRF protection on state-changing routes.
- RBAC on every API route; ticket ownership enforced in the ticket service as well as in the API (defense in depth).
- Zod validation at every boundary; the LLM output is treated as untrusted input.
- Secrets only in environment variables; `.env.example` is committed, `.env` never is.
- Rate limiting per user and IP, plus a daily LLM spend cap that blocks new agent turns when reached.
- Logs never contain message content or personal data.
- Dependency audit and secret scanning in CI.

## 10. Observability

- **Logs:** pino, structured JSON, with `traceId`, `conversationId` and `userId` (as IDs only).
- **Tracing:** OpenTelemetry across web → api → agent → tools → ticket-service.
- **Metrics (Prometheus):**
  - Technical: turn latency, LLM tokens and cost, tool errors, retries, circuit breaker state.
  - Business: % resolved by the agent, tickets created, duplicates avoided, handoffs by reason, handoff wait time, average confidence.
- **Dashboards:** Grafana provisioned by Docker Compose.
- **Health:** `/health` (liveness) and `/ready` (readiness, checks the database and dependencies) on each service.

## 11. Testing strategy

| Level | Scope | Tooling |
|---|---|---|
| Unit | `packages/domain`: priority, business-hours deadlines, overdue, duplicates, reopen, completeness, confidence adjustment | Vitest |
| Integration | API + Postgres + ticket service, privacy (employee A cannot read B's tickets), state transitions, retry behavior | Vitest + Testcontainers |
| Agent evals | About 20 scenarios (help article answer, duplicate → update, out of scope → redirect, critical → handoff, missing info → question, confirmation required), run on Haiku 5.5, Gemini 3.5 Flash-Lite and DeepSeek; README table with accuracy, latency and cost per conversation | Mastra evals / custom runner |
| End-to-end | Login → chat → draft → confirm; analyst takes over and returns the conversation | Playwright |

## 12. Deployment (bonus)

Railway or Fly.io (multiple services plus managed Postgres). Secrets in the platform's secret store, rate limits and the spend cap enabled, and a GitHub Actions pipeline running lint, type check, tests and dependency audit.

## 13. Trade-offs and future work

| Trade-off | Why | With more time |
|---|---|---|
| Full-text search instead of embeddings | 5–10 articles; embeddings add cost and complexity with no measurable gain | Hybrid search (FTS + embeddings) as the knowledge base grows |
| Any-password login | Required by the PRD | SSO/OIDC (Entra ID, Keycloak) through an identity adapter |
| Handoff deadline follows Annex A, unlike the prototype's "2 h" | Annex A is the source of rules | A dedicated handoff SLA if the business asks for one |
| LLM self-reported confidence plus rules | Simple and testable | Calibrate thresholds using eval results and analyst feedback |
| Provider data handling | All data is fictional | In production: data processing agreement and data residency review (LGPD) before choosing a provider |

## 14. Work split and order

1. Monorepo setup, Docker Compose, seed data.
2. `packages/domain` with unit tests (Fabiano).
3. Ticket service with failure injection.
4. API: auth, conversations, drafts, console.
5. Mastra agent, tools, decision record (together).
6. Web UI: chat, console, profile (AI-assisted, reviewed by Fabiano).
7. Observability stack and dashboards.
8. Evals, end-to-end tests, README, deploy.
