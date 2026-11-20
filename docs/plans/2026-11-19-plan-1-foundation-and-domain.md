# Plan 1: Monorepo Foundation and Domain Rules

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working pnpm monorepo with strict TypeScript, linting, tests and CI, plus `packages/domain` implementing every Annex A rule as pure, unit-tested functions.

**Architecture:** `packages/domain` is pure TypeScript with no framework and no I/O. Later plans (ticket-service, api, agent) import it. Enums are `as const` objects with a derived union type. Every date calculation happens in `America/Sao_Paulo`.

**Tech Stack:** Node 26, pnpm 12, TypeScript (strict), Vitest, ESLint (flat config + typescript-eslint), Prettier, date-fns + @date-fns/tz, GitHub Actions.

**Spec:** `docs/design/design-doc.md` (sections 3, 4 and 11)

## Roadmap (one plan per milestone, each written when the previous one is done)

| Plan         | Delivers                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **1 (this)** | Monorepo, CI, `packages/domain`                                                                                          |
| 2            | `packages/contracts`, `apps/ticket-service` (DB, seed, HTTP API, failure injection), Docker Compose                      |
| 3            | `apps/api`: auth, sessions, RBAC, conversations, drafts, console endpoints, ticket client with retry and circuit breaker |
| 4            | Mastra agent: tools, decision record, confidence, handoff, IT-only scope redirect (intent classification), SSE streaming |
| 5            | `apps/web`: login, chat, console, profile                                                                                |
| 6            | Observability: logs, OpenTelemetry, Prometheus metrics, Grafana, health checks                                           |
| 7            | Agent evals across 3 providers, Playwright E2E, README, deploy                                                           |

## Ownership and git flow

- **Task 1:** Claude writes it and explains every file to Fabiano. Branch `chore/monorepo-setup`.
- **Tasks 2–8:** **Fabiano writes the code**; Claude gives hints and reviews. Branch `feat/domain-rules`.
- Commit **and push** at the end of every task. Never commit to `main`. Fabiano opens the pull requests.
- No code comments.

## Global Constraints

- Node `>=26`, pnpm `12.x` (`packageManager` field pins the exact version).
- TypeScript `strict: true`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`. No `any`.
- ESM only (`"type": "module"`).
- Timezone for every business rule: `America/Sao_Paulo`. Business hours: Monday to Friday, 08:00–18:00. Holidays: out of scope (documented in the README).
- Deadlines: CRITICAL 1 hour (24/7); HIGH 4 business hours; MEDIUM 3 business days; LOW 5 business days. One business day = 10 business hours.
- Reopen window: 7 calendar days (7 × 24 h) after `resolvedAt`.
- Default handoff confidence threshold: `0.6`.
- Domain coverage threshold: 90% lines and branches.
- Folder layout inside `packages/domain/src`: `enums/`, `entities/`, `rules/`, `calendar/`; tests mirror it under `packages/domain/test/`.

## Review Focus

1. **Times exactly on a boundary** (a deadline that lands at 18:00 sharp, or a start at 18:00 sharp): the deadline must stay at 18:00 that day, and a start at 18:00 counts from 08:00 next business day. Tests in Task 4.
2. **Server clocks in UTC:** callers pass `Date` objects created from UTC ISO strings; results must be correct in São Paulo time. Every test in Tasks 4–7 builds dates from `...Z` strings.
3. **Bad LLM numbers:** confidence `NaN`, `-0.2` or `1.7` must be clamped and never raise the score. Tests in Task 8.
4. **Accents and case in duplicate detection:** "VPN não conecta" and "vpn nao conecta" must match. Test in Task 6.
5. **Dirty legacy data:** status `RESOLVED` with no `resolvedAt` must be neither reopenable nor overdue. Tests in Tasks 5 and 7.

---

### Task 1: Monorepo setup (Claude, with explanations)

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`, `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `eslint.config.js`, `tsconfig.base.json`, `vitest.config.ts`, `.github/workflows/ci.yml`
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/vitest.config.ts`, `packages/domain/src/index.ts`
- Test: `packages/domain/test/smoke.test.ts`

**Interfaces:**

- Produces: root scripts `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format`; workspace package `@nexo/domain` exporting from `src/index.ts`.

- [ ] **Step 1:** Root `package.json`: `"private": true`, `"type": "module"`, `"packageManager": "pnpm@12.21.0"`, `"engines": { "node": ">=26" }`, scripts `lint`, `typecheck` (`pnpm -r typecheck`), `test` (`vitest run`), `format`. `pnpm-workspace.yaml` lists `apps/*` and `packages/*`. `.nvmrc` = `26`. `packages/domain/package.json`: name `@nexo/domain`, `"type": "module"`, `"exports": { ".": "./src/index.ts" }` (internal package consumed as TypeScript source, no build step).
- [ ] **Step 2:** `tsconfig.base.json` with the compiler flags from Global Constraints, `target: ES2024`, `module: NodeNext`, `moduleResolution: NodeNext`. `packages/domain/tsconfig.json` extends it.
- [ ] **Step 3:** ESLint flat config with `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked`, and Prettier. Root `vitest.config.ts` uses `projects: ['packages/*', 'apps/*']`. The domain `vitest.config.ts` sets coverage thresholds of 90% for lines and branches.
- [ ] **Step 4:** Add dependencies: `pnpm add -Dw typescript vitest @vitest/coverage-v8 eslint typescript-eslint prettier` and `pnpm --filter @nexo/domain add date-fns @date-fns/tz`. If pnpm reports blocked build scripts, run `pnpm approve-builds` and approve only packages that need them.
- [ ] **Step 5: Write the smoke test** `packages/domain/test/smoke.test.ts`: `expect(DOMAIN_TIMEZONE).toBe('America/Sao_Paulo')`. Export `DOMAIN_TIMEZONE` from `src/calendar/timezone.ts` through `src/index.ts`.
- [ ] **Step 6: Verify:** `pnpm install && pnpm lint && pnpm typecheck && pnpm test` all exit 0.
- [ ] **Step 7:** CI workflow on `push` and `pull_request`: `pnpm install --frozen-lockfile`, lint, typecheck, `pnpm test --coverage`, `pnpm audit --audit-level=high`.
- [ ] **Step 8: Commit and push** on `chore/monorepo-setup`: `chore: set up pnpm monorepo with strict TypeScript, lint, tests and CI`.

### Task 2: Enums and entities (Fabiano)

**Files:**

- Create: `packages/domain/src/enums/{ticket-type,category,impact,urgency,priority,ticket-status}.ts`
- Create: `packages/domain/src/entities/{ticket,ticket-draft}.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/enums/enums.test.ts`

**Interfaces:**

- Produces, each as `export const X = {...} as const; export type X = (typeof X)[keyof typeof X];`:
  - `TicketType`: `INC`, `REQ`
  - `Category`: `ACCESS`, `NETWORK_VPN`, `HARDWARE`, `SOFTWARE`, `EMAIL`, `OTHER`
  - `Impact`: `SELF`, `TEAM`, `COMPANY`
  - `Urgency`: `BLOCKED`, `SAME_DAY_COMMITMENT`, `HAS_WORKAROUND`, `NO_URGENCY`
  - `Priority`: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
  - `TicketStatus`: `OPEN`, `IN_PROGRESS`, `WAITING_ANALYST`, `APPROVED`, `RESOLVED`
- Produces:

  ```ts
  interface Ticket {
    id: string;
    type: TicketType;
    title: string;
    description: string;
    category: Category;
    item?: string;
    impact: Impact;
    urgency: Urgency;
    priority: Priority;
    status: TicketStatus;
    requesterId: string;
    createdAt: Date;
    lastUpdateAt: Date;
    resolvedAt?: Date;
  }
  interface TicketDraft {
    type: TicketType;
    title: string;
    description: string;
    category: Category;
    item?: string;
    impact: Impact;
    urgency: Urgency;
  }
  ```

- [ ] **Step 1: Write the failing test:** `Object.values(Category)` equals exactly the 6 values above, in that order; same check for `Priority` (4 values) and `TicketStatus` (5 values).
- [ ] **Step 2: Run** `pnpm test enums`. Expected: FAIL (modules not found).
- [ ] **Step 3: Implement** the enums and entity interfaces; export them all from `src/index.ts`.
- [ ] **Step 4: Run** `pnpm test enums && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit and push:** `feat(domain): add ticket enums and entities`.

### Task 3: Priority matrix and handoff priority (Fabiano)

**Files:**

- Create: `packages/domain/src/rules/priority.ts`
- Test: `packages/domain/test/rules/priority.test.ts`

**Interfaces:**

- Produces: `computePriority(impact: Impact, urgency: Urgency): Priority`
- Produces: `resolveHandoffPriority(input: { ticketPriority?: Priority; impact?: Impact; urgency?: Urgency }): Priority`

Rule (Annex A): `BLOCKED` with impact `TEAM` or `COMPANY` → `CRITICAL`; otherwise `BLOCKED` or `SAME_DAY_COMMITMENT` → `HIGH`; `HAS_WORKAROUND` → `MEDIUM`; `NO_URGENCY` → `LOW`.

- [ ] **Step 1: Write the failing tests** with `it.each` over all 12 combinations:

  | impact \ urgency | BLOCKED  | SAME_DAY_COMMITMENT | HAS_WORKAROUND | NO_URGENCY |
  | ---------------- | -------- | ------------------- | -------------- | ---------- |
  | SELF             | HIGH     | HIGH                | MEDIUM         | LOW        |
  | TEAM             | CRITICAL | HIGH                | MEDIUM         | LOW        |
  | COMPANY          | CRITICAL | HIGH                | MEDIUM         | LOW        |

  Handoff priority: `{ ticketPriority: 'LOW', impact: 'COMPANY', urgency: 'BLOCKED' }` → `LOW` (the ticket wins); `{ impact: 'SELF', urgency: 'BLOCKED' }` → `HIGH`; `{ impact: 'SELF' }` → `MEDIUM`; `{}` → `MEDIUM`.

- [ ] **Step 2: Run** `pnpm test priority`. Expected: FAIL.
- [ ] **Step 3: Implement** both functions in `src/rules/priority.ts`; export them.
- [ ] **Step 4: Run** `pnpm test priority`. Expected: PASS.
- [ ] **Step 5: Commit and push:** `feat(domain): compute priority from impact and urgency`.

### Task 4: Business calendar and deadlines (Fabiano)

**Files:**

- Create: `packages/domain/src/calendar/business-hours.ts`, `packages/domain/src/rules/deadline.ts`
- Test: `packages/domain/test/calendar/business-hours.test.ts`, `packages/domain/test/rules/deadline.test.ts`

**Interfaces:**

- Produces: `addBusinessHours(from: Date, hours: number): Date` (Monday–Friday 08:00–18:00, `America/Sao_Paulo`)
- Produces: `computeDueAt(priority: Priority, from: Date): Date`
- Produces: `DEADLINES: Record<Priority, { kind: 'wall-clock-hours' | 'business-hours'; amount: number }>` = CRITICAL `{wall-clock-hours, 1}`, HIGH `{business-hours, 4}`, MEDIUM `{business-hours, 30}`, LOW `{business-hours, 50}`

Approach: use `TZDate` from `@date-fns/tz` to work in São Paulo local time. A start outside business hours moves to the next business opening (08:00); consume hours day by day; a deadline that lands exactly at 18:00 stays at 18:00.

- [ ] **Step 1: Write the failing tests** (all inputs and outputs as UTC ISO strings; São Paulo is UTC−3):

  | Case                    | Priority | From                               | Expected due                       |
  | ----------------------- | -------- | ---------------------------------- | ---------------------------------- |
  | same day                | HIGH     | `2026-12-09T12:43:00Z` (Wed 09:43) | `2026-12-09T16:43:00Z` (13:43)     |
  | ends at 18:00 exactly   | HIGH     | `2026-12-09T17:00:00Z` (Wed 14:00) | `2026-12-09T21:00:00Z` (18:00)     |
  | crosses the night       | HIGH     | `2026-12-09T19:00:00Z` (Wed 16:00) | `2026-12-10T13:00:00Z` (Thu 10:00) |
  | starts at 18:00 exactly | HIGH     | `2026-12-09T21:00:00Z` (Wed 18:00) | `2026-12-10T15:00:00Z` (Thu 12:00) |
  | before opening          | HIGH     | `2026-12-09T10:00:00Z` (Wed 07:00) | `2026-12-09T15:00:00Z` (12:00)     |
  | crosses the weekend     | HIGH     | `2026-12-11T20:00:00Z` (Fri 17:00) | `2026-12-14T14:00:00Z` (Mon 11:00) |
  | starts on Saturday      | HIGH     | `2026-12-12T13:00:00Z` (Sat 10:00) | `2026-12-14T15:00:00Z` (Mon 12:00) |
  | critical, 24/7          | CRITICAL | `2026-12-12T06:00:00Z` (Sat 03:00) | `2026-12-12T07:00:00Z` (Sat 04:00) |
  | 3 business days         | MEDIUM   | `2026-12-09T17:20:00Z` (Wed 14:20) | `2026-12-14T17:20:00Z` (Mon 14:20) |
  | 5 business days         | LOW      | `2026-12-09T17:20:00Z` (Wed 14:20) | `2026-12-16T17:20:00Z` (Wed 14:20) |

- [ ] **Step 2: Run** `pnpm test deadline business-hours`. Expected: FAIL.
- [ ] **Step 3: Implement** `addBusinessHours`, `DEADLINES` and `computeDueAt`; export them.
- [ ] **Step 4: Run** `pnpm test deadline business-hours`. Expected: PASS.
- [ ] **Step 5: Commit and push:** `feat(domain): compute deadlines in business hours`.

### Task 5: Overdue (Fabiano)

**Files:**

- Create: `packages/domain/src/rules/overdue.ts`
- Test: `packages/domain/test/rules/overdue.test.ts`

**Interfaces:**

- Consumes: `computeDueAt` (Task 4)
- Produces: `isOverdue(ticket: Pick<Ticket, 'priority' | 'status' | 'lastUpdateAt'>, now: Date): boolean`. True when `status !== 'RESOLVED'` and `now > computeDueAt(priority, lastUpdateAt)`.

- [ ] **Step 1: Write the failing tests:** a MEDIUM ticket, `IN_PROGRESS`, `lastUpdateAt = 2026-12-09T17:20:00Z`:
  - now `2026-12-14T17:21:00Z` → `true`
  - now `2026-12-14T17:19:00Z` → `false`
  - now `2026-12-14T17:20:00Z` (exactly due) → `false`
  - same ticket with status `RESOLVED`, now `2026-12-20T00:00:00Z` → `false`
- [ ] **Step 2: Run** `pnpm test overdue`. Expected: FAIL.
- [ ] **Step 3: Implement** and export `isOverdue`.
- [ ] **Step 4: Run** `pnpm test overdue`. Expected: PASS.
- [ ] **Step 5: Commit and push:** `feat(domain): detect overdue tickets`.

### Task 6: Reopen window and duplicate candidates (Fabiano)

**Files:**

- Create: `packages/domain/src/rules/reopen.ts`, `packages/domain/src/rules/duplicates.ts`, `packages/domain/src/rules/text-similarity.ts`
- Test: `packages/domain/test/rules/reopen.test.ts`, `packages/domain/test/rules/duplicates.test.ts`

**Interfaces:**

- Produces: `REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000`
- Produces: `canReopen(ticket: Pick<Ticket, 'status' | 'resolvedAt'>, now: Date): boolean`
- Produces: `similarity(a: string, b: string): number` (0..1)
- Produces: `findDuplicateCandidates(issue: { category: Category; summary: string }, tickets: readonly Ticket[], now: Date): DuplicateCandidate[]`, where `DuplicateCandidate = { ticket: Ticket; similarity: number; action: 'UPDATE' | 'REOPEN' }`
- Produces: `DUPLICATE_SIMILARITY_THRESHOLD = 0.3`

Similarity: lowercase, strip accents (`normalize('NFD')` and remove combining marks), split on non-letters/digits, drop tokens shorter than 3 characters, then Jaccard index of the two token sets. A candidate has the same category, `similarity(issue.summary, ticket.title) >= 0.3`, and is either not resolved (`UPDATE`) or `canReopen` (`REOPEN`). Results are sorted by similarity, highest first.

- [ ] **Step 1: Write the failing tests:**
  - `canReopen`: resolved at `2026-12-09T12:00:00Z`; now `2026-12-13T12:00:00Z` → `true`; now `2026-12-16T12:00:00Z` (exactly 7 days) → `true`; now `2026-12-16T12:00:01Z` → `false`; status `IN_PROGRESS` → `false`; status `RESOLVED` without `resolvedAt` → `false`.
  - `similarity('VPN não conecta', 'vpn nao conecta') === 1`.
  - `findDuplicateCandidates({ category: 'NETWORK_VPN', summary: 'VPN não conecta, erro 809' }, tickets, now)` with: an open NETWORK_VPN ticket "VPN nao conecta no notebook" (→ `UPDATE`), a NETWORK_VPN ticket resolved 3 days ago "Erro 809 na VPN" (→ `REOPEN`), a NETWORK_VPN ticket resolved 10 days ago with the same title (excluded), and an open HARDWARE ticket "VPN não conecta" (excluded, different category). Expect exactly 2 candidates: first the resolved "Erro 809 na VPN" (`REOPEN`, similarity 0.6), then the open one (`UPDATE`, similarity 0.5).
- [ ] **Step 2: Run** `pnpm test reopen duplicates`. Expected: FAIL.
- [ ] **Step 3: Implement** the three modules; export the public functions and constants.
- [ ] **Step 4: Run** `pnpm test reopen duplicates`. Expected: PASS.
- [ ] **Step 5: Commit and push:** `feat(domain): add reopen window and duplicate detection`.

### Task 7: Draft validation (Fabiano)

**Files:**

- Create: `packages/domain/src/rules/draft-validation.ts`
- Test: `packages/domain/test/rules/draft-validation.test.ts`

**Interfaces:**

- Produces: `validateTicketDraft(input: Partial<TicketDraft>): DraftValidation`, where
  `DraftValidation = { ok: true; draft: TicketDraft; priority: Priority } | { ok: false; missing: (keyof TicketDraft)[] }`
- Required fields: `type`, `title`, `description`, `category`, `impact`, `urgency`. Strings count as missing when blank after `trim()`. On success, the draft is returned with trimmed strings and `priority = computePriority(impact, urgency)`.

- [ ] **Step 1: Write the failing tests:** a complete VPN draft (`SELF` + `SAME_DAY_COMMITMENT`) → `ok: true`, `priority: 'HIGH'`; `{}` → `missing` contains all 6 fields; `title: '   '` → `missing` contains `title`; an `item` with surrounding spaces is returned trimmed.
- [ ] **Step 2: Run** `pnpm test draft-validation`. Expected: FAIL.
- [ ] **Step 3: Implement** and export.
- [ ] **Step 4: Run** `pnpm test draft-validation`. Expected: PASS.
- [ ] **Step 5: Commit and push:** `feat(domain): validate ticket drafts`.

### Task 8: Confidence adjustment (Fabiano)

**Files:**

- Create: `packages/domain/src/rules/confidence.ts`
- Test: `packages/domain/test/rules/confidence.test.ts`

**Interfaces:**

- Produces: `RuleCheckId = 'MISSING_REQUIRED_FIELDS' | 'POSSIBLE_DUPLICATE' | 'CATEGORY_UNCLEAR' | 'NO_HELP_ARTICLE' | 'TICKET_SERVICE_UNAVAILABLE'`
- Produces: `RuleCheck = { id: RuleCheckId; passed: boolean; detail: string }`
- Produces: `CONFIDENCE_PENALTIES: Record<RuleCheckId, number>` = MISSING_REQUIRED_FIELDS `0.3`, POSSIBLE_DUPLICATE `0.2`, CATEGORY_UNCLEAR `0.25`, NO_HELP_ARTICLE `0.1`, TICKET_SERVICE_UNAVAILABLE `0.2`
- Produces: `adjustConfidence(llmConfidence: number, checks: readonly RuleCheck[]): { confidence: number; reasons: string[] }`. Clamp the input to [0, 1] (`NaN` → 0), subtract the penalty of each failed check, clamp the result to [0, 1], and add each failed check's `detail` to `reasons`. Never raises the score.
- Produces: `DEFAULT_HANDOFF_THRESHOLD = 0.6`, `shouldHandoff(confidence: number, threshold = DEFAULT_HANDOFF_THRESHOLD): boolean` (true when `confidence < threshold`).

- [ ] **Step 1: Write the failing tests:**
  - `0.76` with failed `CATEGORY_UNCLEAR` and `NO_HELP_ARTICLE` → `0.41` (use `toBeCloseTo`), and 2 reasons (the prototype's "confiança 41%").
  - `0.9` with only passed checks → `0.9`, no reasons.
  - `NaN` → `0`; `1.7` → `1`; `-0.2` → `0`.
  - Every penalty failing at once → `0`, never negative.
  - `shouldHandoff(0.41)` → `true`; `shouldHandoff(0.6)` → `false`; `shouldHandoff(0.7, 0.8)` → `true`.
- [ ] **Step 2: Run** `pnpm test confidence`. Expected: FAIL.
- [ ] **Step 3: Implement** and export.
- [ ] **Step 4: Run** `pnpm test --coverage && pnpm lint && pnpm typecheck`. Expected: PASS, domain coverage ≥ 90%.
- [ ] **Step 5: Commit and push:** `feat(domain): adjust agent confidence with rule checks`. Fabiano opens the PR for `feat/domain-rules`.
