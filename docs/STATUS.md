# Status

The claims pilot is being built to `docs/PLAN.md`. Phases 1 and 2 of 6 are done.

## Built

- `backend/`: FastAPI on SQLite. On first start it creates the database at `DATABASE_PATH` (default `backend/undercover.db`) and loads the queue, policies, customers, plans, add-ons, handlers, company settings and policy wording from `data/`. It never reads `data/evals/` or `data/security/`.
  - Read: `list_claims`, `get_claim`, `get_policy`, `get_customer`, `get_policy_wording`, `get_instructions`, `list_handlers`, `list_steps` and `health`.
  - Write: `start_claim` (waiting to in progress), `record_decision`, `pay_claim`, `sign_off` and `add_step`.
  - Claim states: `waiting`, `in_progress`, `awaiting_signoff` and `decided`. An approval over the $1,000 limit in `data/company.json` waits for sign-off, and `pay_claim` refuses it (403) until a handler signs off. Signing off records the payment.
- `agent/instructions.md`: the UnderCover Agent's instructions, served by `get_instructions`.
- `agent/`: still the skeleton's entry point `run(claim_id, thread_id)` with a health check tool.
- `dashboard/`: still the skeleton's page that shows whether the backend is up.
- `e2e/`: one test of that page.

## Running it

`npm run dev` starts the backend on port 8000 and the dashboard on port 5173. To start again from the seed data, stop the backend and delete `backend/undercover.db`.
