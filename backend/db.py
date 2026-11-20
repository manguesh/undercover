"""UnderCover's database: SQLite, seeded from the records in data/."""

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
INSTRUCTIONS = ROOT / "agent" / "instructions.md"

SCHEMA = """
CREATE TABLE claims (
    claim_id TEXT PRIMARY KEY,
    policy_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    status TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE TABLE policies (policy_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE customers (customer_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE plans (plan TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE add_ons (add_on TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE handlers (handler_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE decisions (
    claim_id TEXT PRIMARY KEY REFERENCES claims,
    decision TEXT NOT NULL,
    payout REAL NOT NULL,
    reasons TEXT NOT NULL,
    policy_section TEXT NOT NULL,
    decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE payments (
    claim_id TEXT PRIMARY KEY REFERENCES claims,
    amount REAL NOT NULL,
    paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sign_offs (
    claim_id TEXT PRIMARY KEY REFERENCES claims,
    handler_id TEXT NOT NULL REFERENCES handlers,
    signed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE steps (
    step_id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id TEXT NOT NULL REFERENCES claims,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def load(name: str) -> Any:
    """Read one of the JSON files in data/."""
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def seed(conn: sqlite3.Connection) -> None:
    """Create the tables and load the queue and its records from data/."""
    conn.executescript(SCHEMA)
    conn.executemany(
        "INSERT INTO claims VALUES (?, ?, ?, 'waiting', ?)",
        [
            (c["claim_id"], c["policy_id"], c["customer_id"], json.dumps(c))
            for c in load("claims.json")
        ],
    )
    tables = [
        ("policies", "policy_id", load("policies.json")),
        ("customers", "customer_id", load("customers.json")),
        ("handlers", "handler_id", load("handlers.json")),
        ("plans", "plan", load("plans.json")["plans"]),
        ("add_ons", "add_on", load("plans.json")["add_ons"]),
    ]
    for table, key, rows in tables:
        conn.executemany(
            f"INSERT INTO {table} VALUES (?, ?)",  # noqa: S608 - fixed table names
            [(row[key], json.dumps(row)) for row in rows],
        )
    wording = (DATA / "policy_wording.md").read_text(encoding="utf-8")
    conn.executemany(
        "INSERT INTO settings VALUES (?, ?)",
        [
            ("company", json.dumps(load("company.json"))),
            ("policy_wording", wording),
        ],
    )
    conn.commit()


def connect() -> sqlite3.Connection:
    """Open the database at DATABASE_PATH, creating and seeding it if it's new."""
    path = Path(os.getenv("DATABASE_PATH", str(ROOT / "backend" / "undercover.db")))
    new = not path.exists()
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    if new:
        seed(conn)
    return conn
