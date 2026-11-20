"""The UnderCover backend."""

import json
import sqlite3
from collections.abc import Iterator
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException

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
