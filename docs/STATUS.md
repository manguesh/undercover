# Status

The claims pilot is being built to `docs/PLAN.md`. Phases 1 to 4 of 6 are done.

## Built

- `backend/`: FastAPI on SQLite. On first start it creates the database at `DATABASE_PATH` (default `backend/undercover.db`) and loads the queue, policies, customers, plans, add-ons, handlers, company settings and policy wording from `data/`. It never reads `data/evals/` or `data/security/`.
  - Read: `list_claims`, `get_claim`, `get_policy`, `get_customer`, `get_policy_wording`, `get_instructions`, `list_handlers`, `list_steps` and `health`.
  - Write: `start_claim` (waiting to in progress), `record_decision`, `pay_claim`, `sign_off` and `add_step`.
  - Agent runs: `run_claim` starts the agent on a waiting claim in the background, and `run_queue` works every waiting claim one after another. A run that fails or ends without a decision records an `error` step and puts the claim back to `waiting`.
  - Claim states: `waiting`, `in_progress`, `awaiting_signoff` and `decided`. An approval over the $1,000 limit in `data/company.json` waits for sign-off, and `pay_claim` refuses it (403) until a handler signs off. Signing off records the payment.
- `agent/`: the UnderCover Agent. `run(claim_id, thread_id)` reads its instructions from `get_instructions`, then decides the claim with tools that call the API: `get_claim`, `get_policy`, `get_customer`, `get_policy_wording`, `record_decision` and `pay_claim`. Each tool call, tool result and reply is recorded as a step. A refusal from the API comes back to the model as the tool's result. The model is `openai/gpt-6-luna` on OpenRouter, or `MODEL_NAME` if set.
- `agent/instructions.md`: the agent's instructions.
- `dashboard/`: React, in UnderCover's brand, with light and dark mode. The queue (every claim with its state, decision and payout, a count by state, and a "Work the queue" button) refreshes every two seconds. The instructions page shows the agent's instructions, read only. Views are switched by the URL hash.
- `e2e/`: Playwright tests of the queue and the instructions. Playwright starts its own backend on port 8001, with a fresh database in the system temp folder, and its own dashboard on port 5174, so it never touches the dev servers or their data.

## Running it

`npm run dev` starts the backend on port 8000 and the dashboard on port 5173. To start again from the seed data, stop the backend and delete `backend/undercover.db`.
