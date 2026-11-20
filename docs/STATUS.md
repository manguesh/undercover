# Status

The claims pilot is being built to `docs/PLAN.md`. Phase 1 of 6 is done.

## Built

- `backend/`: FastAPI on SQLite. On first start it creates the database at `DATABASE_PATH` (default `backend/undercover.db`) and loads the queue, policies, customers, plans, add-ons, handlers, company settings and policy wording from `data/`. It never reads `data/evals/` or `data/security/`. It serves the read API: `list_claims`, `get_claim`, `get_policy`, `get_customer`, `get_policy_wording`, `get_instructions`, `list_handlers` and `health`.
- `agent/instructions.md`: the UnderCover Agent's instructions, served by `get_instructions`.
- `agent/`: still the skeleton's entry point `run(claim_id, thread_id)` with a health check tool.
- `dashboard/`: still the skeleton's page that shows whether the backend is up.
- `e2e/`: one test of that page.

## Running it

`npm run dev` starts the backend on port 8000 and the dashboard on port 5173. To start again from the seed data, stop the backend and delete `backend/undercover.db`.
