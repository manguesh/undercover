# Status

The claims pilot from `docs/SPEC.md` is built, to the plan in `docs/PLAN.md`.

## Running it

- `npm run dev` starts the backend on port 8000 and the dashboard at http://localhost:5173.
- The agent needs `OPENROUTER_API_KEY` in `.env`. It uses `openai/gpt-6-luna` with low reasoning effort, or the model in `MODEL_NAME` if set, such as `openrouter/free`.
- Run the agent from the dashboard: "Run the agent" on a claim, or "Work the queue" for every waiting claim, one after another.
- The database is `backend/undercover.db`, created from `data/` on first start. To start again from the seed data, stop the backend and delete it.
- `npm run check` runs every check. Tests never call a model.

## What's built

### `backend/`

FastAPI on SQLite (`backend/db.py`, `backend/main.py`). On first start it creates the database at `DATABASE_PATH` (default `backend/undercover.db`) and loads the queue, policies, customers, plans, add-ons, handlers, company settings and policy wording from `data/`. It never reads `data/evals/` or `data/security/`, so the handlers' decisions can't reach the agent.

Every operation has an `operation_id`, a one-line docstring and no optional inputs:

| Operation | Route |
|---|---|
| `health` | `GET /api/health` |
| `list_claims` | `GET /api/claims` |
| `get_claim` | `GET /api/claims/{claim_id}`, with its decision, payment and sign-off |
| `get_policy` | `GET /api/policies/{policy_id}`, with its plan's limits and add-ons |
| `get_customer` | `GET /api/customers/{customer_id}`, with claim history |
| `get_policy_wording` | `GET /api/policy-wording` |
| `get_instructions` | `GET /api/instructions`, from `agent/instructions.md` |
| `list_handlers` | `GET /api/handlers` |
| `list_steps` / `add_step` | `GET` / `POST /api/claims/{claim_id}/steps` |
| `start_claim` | `POST /api/claims/{claim_id}/start`: waiting to in progress |
| `record_decision` | `POST /api/claims/{claim_id}/decision`: approve, decline or refer, with payout, reasons and policy section |
| `pay_claim` | `POST /api/claims/{claim_id}/payments`, with the amount |
| `sign_off` | `POST /api/claims/{claim_id}/sign-off`, with a handler id; records the payment |
| `run_claim` | `POST /api/claims/{claim_id}/run`: starts the agent in the background |
| `run_queue` | `POST /api/queue/run`: works every waiting claim in turn |

Claim states: `waiting`, `in_progress`, `awaiting_signoff` and `decided`.

The rules are enforced in the backend:

- An approval over the $1,000 limit in `data/company.json` moves the claim to `awaiting_signoff`, and `pay_claim` refuses it (403) until a handler signs off, even if the agent tries to pay.
- `pay_claim` also refuses a payment that doesn't match the approved payout, a second payment, and a payment of a claim that wasn't approved.
- A decline or referral has a payout of 0.
- A run that fails, or ends without a decision, records an `error` step and puts the claim back to `waiting`.

### `agent/`

The UnderCover Agent (`agent/main.py`): LangChain's `create_agent` on OpenRouter. `run(claim_id, thread_id)` reads its instructions from `get_instructions`, then decides the claim with tools that call the API: `get_claim`, `get_policy`, `get_customer`, `get_policy_wording`, `record_decision` and `pay_claim`. It reads no files. A refusal from the API comes back to the model as the tool's result. Each tool call, tool result and reply is recorded as a step for the dashboard.

`agent/instructions.md` holds its instructions: read the claim first, then the policy, the customer and the policy wording; decide from the wording alone; work out the payout as section 10 says; explain in two or three sentences with the section; and pay only approvals of $1,000 or less.

### `dashboard/`

React, Vite and TypeScript, in UnderCover's brand, with light and dark mode following the system setting. Views are switched by the URL hash.

- **Queue** (`#/`): every claim with its state, decision and payout, a count by state, and "Work the queue". It refreshes every two seconds.
- **Claim** (`#/claims/CLM-1001`): the claim in full (story, items, documents, policy and the customer's earlier claims), the decision with its reasons and policy section, the payment, and the agent's steps, refreshed every two seconds. "Run the agent" on a waiting claim; a handler picker with "Sign off and pay" on a claim waiting for sign-off.
- **Instructions** (`#/instructions`): the agent's instructions, read only.

### `e2e/`

Playwright tests of the queue, the instructions and the claim page, including sign-off. They play the agent's part through the API, so they never call a model. Playwright starts its own backend on port 8001, with a fresh database in the system temp folder, and its own dashboard on port 5174, so it never touches the dev servers or their data.

## Known limits

- The agent's accuracy hasn't been measured against the handlers' decisions in `data/evals/`; that's for a later build.
- In the pilot's live runs, CLM-1008 (a trip canceled before departure after a tornado) was declined under the general exclusion for events outside the trip dates. That reading looks doubtful, since trip cancellation is by nature before the trip; it's an example of what the evaluations should catch.
