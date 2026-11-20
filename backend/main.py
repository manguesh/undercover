"""The UnderCover backend."""

import json
import sqlite3
from collections.abc import Iterator
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from backend import db

app = FastAPI(title="UnderCover")


def database() -> Iterator[sqlite3.Connection]:
    """Open a connection for one request."""
    conn = db.connect()
    try:
        yield conn
    finally:
        conn.close()


Database = Annotated[sqlite3.Connection, Depends(database)]


def find(conn: sqlite3.Connection, table: str, key: str, value: str) -> dict[str, Any]:
    """Return one record's data, or raise a 404."""
    row = conn.execute(
        f"SELECT data FROM {table} WHERE {key} = ?",  # noqa: S608 - fixed names
        (value,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, f"{value} not found")
    return json.loads(row["data"])


def one(conn: sqlite3.Connection, sql: str, claim_id: str) -> dict[str, Any] | None:
    """Return the row a query finds for a claim, or None."""
    row = conn.execute(sql, (claim_id,)).fetchone()
    return dict(row) if row else None


@app.get("/api/health", operation_id="health")
def health() -> dict[str, str]:
    """Check that the backend is running."""
    return {"status": "ok"}


@app.get("/api/claims", operation_id="list_claims")
def list_claims(conn: Database) -> list[dict[str, Any]]:
    """List the claims queue with where each claim stands."""
    rows = conn.execute(
        """SELECT c.claim_id, c.status, c.data, cu.data AS customer,
                  d.decision, d.payout
           FROM claims c
           JOIN customers cu USING (customer_id)
           LEFT JOIN decisions d USING (claim_id)
           ORDER BY c.claim_id"""
    ).fetchall()
    claims = []
    for row in rows:
        data = json.loads(row["data"])
        claims.append(
            {
                "claim_id": row["claim_id"],
                "customer_name": json.loads(row["customer"])["name"],
                "claim_type": data["claim_type"],
                "summary": data["summary"],
                "submitted_on": data["submitted_on"],
                "amount_claimed": data["amount_claimed"],
                "status": row["status"],
                "decision": row["decision"],
                "payout": row["payout"],
            }
        )
    return claims


@app.get("/api/claims/{claim_id}", operation_id="get_claim")
def get_claim(claim_id: str, conn: Database) -> dict[str, Any]:
    """Get a claim in full, with its decision, payment and sign-off."""
    claim = find(conn, "claims", "claim_id", claim_id)
    claim["status"] = status_of(conn, claim_id)
    claim["decision"] = one(
        conn,
        "SELECT decision, payout, reasons, policy_section, decided_at"
        " FROM decisions WHERE claim_id = ?",
        claim_id,
    )
    claim["payment"] = one(
        conn, "SELECT amount, paid_at FROM payments WHERE claim_id = ?", claim_id
    )
    claim["sign_off"] = one(
        conn,
        "SELECT s.handler_id, json_extract(h.data, '$.name') AS handler_name,"
        " s.signed_at FROM sign_offs s JOIN handlers h USING (handler_id)"
        " WHERE claim_id = ?",
        claim_id,
    )
    return claim


@app.get("/api/policies/{policy_id}", operation_id="get_policy")
def get_policy(policy_id: str, conn: Database) -> dict[str, Any]:
    """Get a policy with its plan's limits and its add-ons."""
    policy = find(conn, "policies", "policy_id", policy_id)
    policy["plan_details"] = find(conn, "plans", "plan", policy["plan"])
    policy["add_on_details"] = [
        find(conn, "add_ons", "add_on", add_on) for add_on in policy["add_ons"]
    ]
    return policy


@app.get("/api/customers/{customer_id}", operation_id="get_customer")
def get_customer(customer_id: str, conn: Database) -> dict[str, Any]:
    """Get a customer with their claim history."""
    return find(conn, "customers", "customer_id", customer_id)


@app.get("/api/policy-wording", operation_id="get_policy_wording")
def get_policy_wording(conn: Database) -> dict[str, str]:
    """Get the policy wording, the contract with the customer."""
    return {"policy_wording": setting(conn, "policy_wording")}


@app.get("/api/instructions", operation_id="get_instructions")
def get_instructions() -> dict[str, str]:
    """Get the UnderCover Agent's instructions."""
    return {"instructions": db.INSTRUCTIONS.read_text(encoding="utf-8")}


@app.get("/api/handlers", operation_id="list_handlers")
def list_handlers(conn: Database) -> list[dict[str, Any]]:
    """List the claims handlers."""
    rows = conn.execute("SELECT data FROM handlers ORDER BY handler_id").fetchall()
    return [json.loads(row["data"]) for row in rows]


def setting(conn: sqlite3.Connection, name: str) -> str:
    """Return one of the company's settings."""
    return conn.execute(
        "SELECT value FROM settings WHERE name = ?", (name,)
    ).fetchone()["value"]


def status_of(conn: sqlite3.Connection, claim_id: str) -> str:
    """Return where a claim stands, or raise a 404."""
    row = conn.execute(
        "SELECT status FROM claims WHERE claim_id = ?", (claim_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, f"{claim_id} not found")
    return row["status"]


class Decision(BaseModel):
    """The agent's decision on a claim."""

    decision: Literal["approve", "decline", "refer"]
    payout: float = Field(ge=0)
    reasons: str = Field(min_length=1)
    policy_section: str = Field(min_length=1)


class Payment(BaseModel):
    """A payment of an approved claim."""

    amount: float = Field(gt=0)


class SignOff(BaseModel):
    """A handler's sign-off on a payout over the approval limit."""

    handler_id: str


class Step(BaseModel):
    """One thing the agent did while working a claim."""

    kind: Literal["tool_call", "tool_result", "message", "error"]
    text: str


def money(amount: float) -> str:
    """Format an amount in US dollars, such as $1,250.00."""
    return f"${amount:,.2f}"


def payout_limit(conn: sqlite3.Connection) -> float:
    """Return the payout above which a handler must sign off."""
    return json.loads(setting(conn, "company"))["payout_approval_limit"]


def move(conn: sqlite3.Connection, claim_id: str, before: str, after: str) -> None:
    """Move a claim from one state to the next, or raise a 409."""
    status = status_of(conn, claim_id)
    moved = conn.execute(
        "UPDATE claims SET status = ? WHERE claim_id = ? AND status = ?",
        (after, claim_id, before),
    ).rowcount
    if not moved:
        raise HTTPException(409, f"{claim_id} is {status}, not {before}")


def pay(conn: sqlite3.Connection, claim_id: str, amount: float) -> None:
    """Record a payment."""
    conn.execute(
        "INSERT INTO payments (claim_id, amount) VALUES (?, ?)", (claim_id, amount)
    )


@app.post("/api/claims/{claim_id}/start", operation_id="start_claim")
def start_claim(claim_id: str, conn: Database) -> dict[str, Any]:
    """Take a waiting claim and mark it in progress."""
    move(conn, claim_id, "waiting", "in_progress")
    conn.commit()
    return get_claim(claim_id, conn)


@app.post("/api/claims/{claim_id}/decision", operation_id="record_decision")
def record_decision(claim_id: str, body: Decision, conn: Database) -> dict[str, Any]:
    """Approve, decline or refer a claim in progress, with the payout and reasons."""
    if body.decision != "approve" and body.payout != 0:
        raise HTTPException(422, f"A {body.decision} decision has a payout of 0")
    over_limit = body.decision == "approve" and body.payout > payout_limit(conn)
    move(conn, claim_id, "in_progress", "awaiting_signoff" if over_limit else "decided")
    conn.execute(
        "INSERT INTO decisions (claim_id, decision, payout, reasons, policy_section)"
        " VALUES (?, ?, ?, ?, ?)",
        (claim_id, body.decision, body.payout, body.reasons, body.policy_section),
    )
    conn.commit()
    return get_claim(claim_id, conn)


@app.post("/api/claims/{claim_id}/payments", operation_id="pay_claim")
def pay_claim(claim_id: str, body: Payment, conn: Database) -> dict[str, Any]:
    """Pay an approved claim its payout, once a handler has signed off if needed."""
    claim = get_claim(claim_id, conn)
    decision = claim["decision"]
    if decision is None or decision["decision"] != "approve":
        raise HTTPException(409, f"{claim_id} has no approval to pay")
    if claim["payment"]:
        raise HTTPException(409, f"{claim_id} has already been paid")
    if round(body.amount, 2) != round(decision["payout"], 2):
        raise HTTPException(
            409, f"The approved payout for {claim_id} is {money(decision['payout'])}"
        )
    if decision["payout"] > payout_limit(conn) and claim["sign_off"] is None:
        raise HTTPException(
            403,
            f"A payout over {money(payout_limit(conn))} needs a handler's sign-off"
            " before it can be paid",
        )
    pay(conn, claim_id, body.amount)
    conn.commit()
    return get_claim(claim_id, conn)


@app.post("/api/claims/{claim_id}/sign-off", operation_id="sign_off")
def sign_off(claim_id: str, body: SignOff, conn: Database) -> dict[str, Any]:
    """Sign off a payout over the approval limit as a handler, and pay it."""
    find(conn, "handlers", "handler_id", body.handler_id)
    move(conn, claim_id, "awaiting_signoff", "decided")
    conn.execute(
        "INSERT INTO sign_offs (claim_id, handler_id) VALUES (?, ?)",
        (claim_id, body.handler_id),
    )
    payout = conn.execute(
        "SELECT payout FROM decisions WHERE claim_id = ?", (claim_id,)
    ).fetchone()["payout"]
    pay(conn, claim_id, payout)
    conn.commit()
    return get_claim(claim_id, conn)


@app.get("/api/claims/{claim_id}/steps", operation_id="list_steps")
def list_steps(claim_id: str, conn: Database) -> list[dict[str, Any]]:
    """List what the agent has done on a claim, in order."""
    status_of(conn, claim_id)
    rows = conn.execute(
        "SELECT step_id, kind, text, created_at FROM steps"
        " WHERE claim_id = ? ORDER BY step_id",
        (claim_id,),
    ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/claims/{claim_id}/steps", operation_id="add_step")
def add_step(claim_id: str, body: Step, conn: Database) -> dict[str, Any]:
    """Record one thing the agent did while working a claim."""
    status_of(conn, claim_id)
    row = conn.execute(
        "INSERT INTO steps (claim_id, kind, text) VALUES (?, ?, ?)"
        " RETURNING step_id, kind, text, created_at",
        (claim_id, body.kind, body.text),
    ).fetchone()
    conn.commit()
    return dict(row)
