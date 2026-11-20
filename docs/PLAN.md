# Plan: the claims pilot

This plan builds the pilot in `docs/SPEC.md` on top of the hello-world skeleton, using the stack in `docs/TECH_STACK.md`. It has six phases, and each one builds on the last. Every phase ends with tests, the checks in `docs/PROCESS.md`, an update to `docs/STATUS.md` and a commit.

## The shape of the system

```
dashboard (React)  ──HTTP──▶  backend (FastAPI + SQLite)  ◀──HTTP──  UnderCover Agent (create_agent)
                                     │  starts a run in the background ───────▲
                                     ▼
                                data/ (seed, never data/evals/)
```

- **The backend owns everything.** It holds the claims, the decisions, the payments, the agent's steps and the agent's instructions, and it enforces the rules. The agent and the dashboard are both clients of its API.
- **The agent reaches the world only through the API**, as the tech stack requires. Its tools are thin wrappers over API calls, and it reads its own instructions from `GET /api/instructions`.
- **The rules live in the backend, not the prompt.** The $1,000 sign-off rule is checked by the payment operation, so the payment is blocked even if the agent tries to pay. The prompt asks the agent to behave; the backend makes sure it does.
- **`data/evals/` is never loaded.** The backend seeds only from the queue's files, so no API call can return the handlers' decisions, and the agent can't see what the backend doesn't have.

### Claim states

| State | Meaning | Set by |
|---|---|---|
| `waiting` | In the queue, not started (the seed's `open`) | seeding |
| `in_progress` | The agent is working on it | starting a run |
| `awaiting_signoff` | Approved with a payout over $1,000; payment waits for a handler | recording the decision |
| `decided` | Approved and paid (payout up to $1,000, or after sign-off), declined or referred | recording the decision, payment or sign-off |

If a run fails, or ends without a decision, the claim goes back to `waiting` with an error step, so a handler can see what happened and run it again.

### The API

Every operation has an `operation_id`, a one-line docstring and no optional inputs.

| Operation | Route | Used by |
|---|---|---|
| `list_claims` | `GET /api/claims` | dashboard |
| `get_claim` | `GET /api/claims/{claim_id}` | agent, dashboard |
| `get_policy` | `GET /api/policies/{policy_id}` (with its plan's limits and add-ons) | agent, dashboard |
| `get_customer` | `GET /api/customers/{customer_id}` (with claim history) | agent, dashboard |
| `get_policy_wording` | `GET /api/policy-wording` | agent |
| `get_instructions` | `GET /api/instructions` | agent, dashboard |
| `list_handlers` | `GET /api/handlers` | dashboard |
| `start_claim` | `POST /api/claims/{claim_id}/start` (added in Phase 2: takes a waiting claim and marks it in progress, so tests can play the agent's part) | `run_claim`, tests |
| `record_decision` | `POST /api/claims/{claim_id}/decision` with decision, payout, reasons, policy section | agent |
| `pay_claim` | `POST /api/claims/{claim_id}/payments` with the amount | agent |
| `sign_off` | `POST /api/claims/{claim_id}/sign-off` with a handler id | dashboard |
| `list_steps` | `GET /api/claims/{claim_id}/steps` | dashboard |
| `add_step` | `POST /api/claims/{claim_id}/steps` | the agent's runner, not the model |
| `run_claim` | `POST /api/claims/{claim_id}/run` | dashboard |
| `run_queue` | `POST /api/queue/run` | dashboard |

### Choices, and why

- **Plain `sqlite3`, no ORM.** A handful of tables, seeded from JSON. The standard library keeps it small, and the claim's items and documents stay as JSON columns since nothing queries inside them.
- **The agent runs inside the backend as a background task.** `run_claim` sets the claim to `in_progress`, returns at once, and runs `agent.run(claim_id, thread_id)` in FastAPI's background tasks. No job queue or extra process to start: `npm run dev` stays the only command.
- **Steps are recorded by the runner, not the model.** The agent streams its updates, and for each tool call, tool result and final reply the runner posts a step to `add_step`. The model can't forget or fake a step, and the dashboard shows them by polling every couple of seconds while a claim is in progress. Polling is simpler than websockets and fast enough to watch.
- **The agent works out the payout; the backend checks the payment.** The spec asks the agent to calculate, so the instructions walk it through section 10 of the wording. The backend refuses a payment that doesn't match the approved payout, or that is over $1,000 without a sign-off.
- **Sign-off releases the payment.** A handler picks their name (there's no sign-in) and signs off, which records the sign-off and the payment and moves the claim to `decided`.
- **Tests never call a model.** Agent tests use the skeleton's stub model with scripted tool calls. Playwright tests play the agent's part by calling the API directly (recording steps and decisions), so they test the dashboard without a model.
- **Playwright gets its own servers.** It starts the backend on port 8001 with a fresh database and Vite on port 5174, so tests never touch your dev data or clash with `npm run dev`. The Vite proxy reads the backend's address from an environment variable for this.
- **No router library.** The dashboard has three views (queue, claim, instructions), so a small hash-based switch (`#/claims/CLM-1001`) is enough.

### Not in the pilot

As the spec says: the claims manual, sign-in, real payments and messages to customers. `data/knowledge.json`, `data/policy_wording_short.md` and `data/security/` aren't used either.

---

## Phase 1: the database and the read API

The backend loads UnderCover's records into SQLite and serves them.

- `backend/db.py`: the schema (claims, policies, customers, plans, handlers, decisions, payments, sign-offs, steps) and seeding from `data/` on startup when the database is new. The path comes from `DATABASE_PATH`, defaulting to `backend/undercover.db` (already gitignored).
- Seeding maps the queue's `open` status to `waiting` and reads only the files the queue needs. It never reads `data/evals/` or `data/security/`.
- The read operations: `list_claims` (id, customer name, claim type, submitted date, amount claimed, state, decision and payout), `get_claim`, `get_policy` (with its plan's limits and the add-ons' details), `get_customer`, `get_policy_wording`, `list_handlers`.
- `get_instructions` serves `agent/instructions.md`, with a first version of the instructions written here (refined in Phase 3).

Success criteria:

- [x] `uv run pytest -q backend` passes, with tests for each operation and a 404 for an unknown claim, policy and customer.
- [x] A test seeds a fresh database and finds 25 claims, all `waiting`, and 3 handlers.
- [x] A test checks that no handler decision reaches the API: none of the eval set's fields (`calculation`, `failure_class`, `difficulty`) appears in any response, and the seeding code has no path into `data/evals/`.
- [x] A test walks `app.openapi()` and checks that every operation has an `operation_id`, a summary and no optional parameters.
- [x] With `npm run dev:backend` running, `curl localhost:8000/api/claims` returns 25 claims and `curl localhost:8000/api/claims/CLM-1001` returns Maya Patel's delayed flight with its 4 documents.
- [x] `npm run check:python` passes with coverage at or above 80%.

## Phase 2: decisions, payments and sign-off

The backend records decisions and enforces the rules.

- `record_decision` takes `decision` (`approve`, `decline` or `refer`), `payout`, `reasons` and `policy_section`. It needs a claim `in_progress`. An approval over the payout approval limit in `data/company.json` moves the claim to `awaiting_signoff`; anything else moves it to `decided`. A decline or referral must have a payout of 0.
- `pay_claim` takes the amount and records a payment. It is refused (409) unless the claim is approved and unpaid and the amount equals the approved payout, and refused (403) when the payout is over the limit and no handler has signed off.
- `sign_off` takes a handler id. It needs a claim in `awaiting_signoff`, records who signed off and when, records the payment and moves the claim to `decided`.
- `add_step` and `list_steps`: numbered steps with a kind (`tool_call`, `tool_result`, `message`, `error`) and text.
- `get_claim` now includes the decision, the payment and the sign-off.

Success criteria:

- [x] `uv run pytest -q backend` passes, with tests for each rule:
  - [x] an approval of $420.00 moves the claim to `decided`, and paying $420.00 succeeds
  - [x] an approval of $1,250.00 moves the claim to `awaiting_signoff`, and paying $1,250.00 is refused with 403
  - [x] after a handler signs off, the claim is `decided` and has one payment of $1,250.00
  - [x] paying the wrong amount, paying twice, paying a declined claim and signing off a claim that isn't awaiting sign-off are each refused
  - [x] a decision on a claim that isn't `in_progress` is refused
- [x] Steps come back in order from `list_steps`.
- [x] `npm run check:python` passes with coverage at or above 80%.

## Phase 3: the UnderCover Agent

The agent decides claims through the API, and the backend runs it.

- `agent/instructions.md`: the agent's instructions. Read the claim, the policy and the customer's history, then the policy wording. Decide from the wording alone. Work out the payout step by step as section 10 says (eligible amounts, per-item limits, amounts already paid by others, the deductible where it applies, the benefit maximum). Record the decision with two or three plain sentences and the section relied on. Pay only an approval of $1,000 or less; leave larger ones for sign-off. Refer when the wording can't settle the claim or a document it needs is missing.
- `agent/main.py`: tools for `get_claim`, `get_policy`, `get_customer`, `get_policy_wording`, `record_decision` and `pay_claim`, each a thin call to the API that hands an error's message back to the model rather than raising. `run(claim_id, thread_id)` fetches the instructions from the API, streams the agent and posts each tool call, tool result (shortened) and final reply as a step. The model and `MODEL_NAME` handling stay as in the skeleton.
- `run_claim` and `run_queue` in the backend: `run_claim` moves a `waiting` claim to `in_progress` and runs the agent in the background with a new thread id; `run_queue` does the same for every waiting claim, one after another. A failed run, or one that ends without a decision, records an `error` step and returns the claim to `waiting`.
- The skeleton's `check_backend` tool goes.

Success criteria:

- [ ] `uv run pytest -q agent backend` passes. Tests use the stub model with scripted tool calls and a `TestClient` in place of HTTP:
  - [ ] a scripted run on CLM-1001 reads the claim, records an approval of $420.00 and pays it; the claim is `decided` with a payment, and the steps show each tool call in order
  - [ ] a scripted run that tries to pay $1,250.00 before sign-off gets the refusal back as a tool result, and no payment is recorded
  - [ ] a run that raises, and a run that ends without a decision, each leave the claim `waiting` with an `error` step
  - [ ] `run_claim` refuses a claim that isn't `waiting`
- [ ] The agent's code reads no files: searching `agent/main.py` for `open(`, `Path` and `data/` finds nothing, so all its data comes from the API.
- [ ] A live check, only if `OPENROUTER_API_KEY` is set (a few cents, or free with `MODEL_NAME=openrouter/free`): with `npm run dev:backend` running, `curl -X POST localhost:8000/api/claims/CLM-1001/run`, then `list_steps` shows the agent's tool calls and `get_claim` shows a decision with reasons and a policy section. I'll report the decision; whether it's right isn't checked here, since that needs the eval set.
- [ ] `npm run check:python` passes with coverage at or above 80%.

## Phase 4: the dashboard shell, the queue and the instructions

The handlers can see the queue and the agent's instructions, in UnderCover's brand.

- Brand: Instrument Sans, Instrument Serif and JetBrains Mono from Google Fonts; the colors and surfaces from `docs/BRAND.md` as CSS variables, with light and dark mode following the system setting. Rounded panels, no outlines. Ids and amounts in JetBrains Mono, money as $1,250.00.
- A header with UnderCover's name and links to Queue and Instructions; a hash-based switch between views.
- Queue view: a table of the 25 claims with id, customer, claim type, submitted date, amount claimed, state, decision and payout. State chips: waiting in Marigold, in progress in Cerulean, waiting for sign-off in Coral, decided in Sea Green, with readable text on each. A count of claims in each state above the table. A "Work the queue" button calls `run_queue`. The queue refreshes every few seconds while any claim is in progress.
- Instructions view: the instructions from `get_instructions`, read only.
- A small typed API module for the dashboard's calls, with types matching the backend's responses.

Success criteria:

- [ ] `npm run check:ts` passes: Prettier, ESLint, tsc (strict, no `any`) and vitest with coverage at or above 80%, with tests for the queue, the state chips, money formatting and the instructions view.
- [ ] `npm run e2e` passes, with tests that the queue shows 25 claims all waiting and that the instructions view shows the instructions. Playwright runs its own backend on port 8001 with a fresh database.
- [ ] In the browser, through the Playwright MCP server, with `npm run dev` running: the queue at `localhost:5173` shows the 25 claims in the brand's fonts and colors, and the instructions view shows the instructions. I'll take a screenshot of each in light and dark mode and check them against `docs/BRAND.md`.

## Phase 5: the claim view

A handler can open a claim, run the agent, watch it work and sign off.

- Claim view, opened from the queue: the story, the items with amounts, the documents, the policy (plan, add-ons, trip dates, travelers) and the customer's claim history.
- The decision panel: approve, decline or refer, the payout, the reasons and the policy section, and the payment once made.
- The agent's steps, in order, refreshed every two seconds while the claim is in progress.
- A "Run the agent" button on a waiting claim.
- On a claim waiting for sign-off: a note that the payment waits for a handler, a handler picker and a "Sign off and pay" button.

Success criteria:

- [ ] `npm run check:ts` passes with coverage at or above 80%, with tests for each part of the claim view and the sign-off flow.
- [ ] `npm run e2e` passes, with tests that play the agent's part through the API:
  - [ ] a claim shows its story, items and documents
  - [ ] steps posted to a claim in progress appear in the view without a reload
  - [ ] an approval of $1,250.00 shows as waiting for sign-off; signing off as Dana Whitfield moves it to decided with the payment shown, in both the claim view and the queue
  - [ ] a decline shows its reasons and policy section
- [ ] In the browser, through the Playwright MCP server: I open CLM-1001, see its full details, and take a screenshot of the claim view.

## Phase 6: the pilot end to end

The whole pilot works together with a real model, and the docs are up to date.

- A live run through the dashboard, if `OPENROUTER_API_KEY` is set: run the agent on a few claims and watch them through.
- `docs/STATUS.md`: what's built, how to run it, and the API.
- A short `README` section on running the pilot, if the repo's README needs one for the product.

Success criteria:

- [ ] Through the Playwright MCP server, with `npm run dev` running: I click "Run the agent" on CLM-1001, watch the steps appear as the agent works, and see its decision with reasons and a policy section. I'll take screenshots and report what the agent decided.
- [ ] If any of those claims is approved over $1,000, I sign it off in the dashboard and check the payment appears; if none is, the Phase 5 end-to-end test already covers that path.
- [ ] `docs/STATUS.md` describes the pilot as built and how to run it.
- [ ] `npm run check` passes in full: ruff, pyright, pytest, Prettier, ESLint, tsc, vitest and Playwright.
