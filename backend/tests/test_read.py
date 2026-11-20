import pytest
from fastapi.testclient import TestClient

from backend import db
from backend.main import app

client = TestClient(app)


def test_seeds_the_queue():
    claims = client.get("/api/claims").json()
    assert len(claims) == 25
    assert {claim["status"] for claim in claims} == {"waiting"}
    assert claims[0] == {
        "claim_id": "CLM-1001",
        "customer_name": "Maya Patel",
        "claim_type": "trip_delay",
        "summary": "Flight home canceled by the airline, rebooked the next morning",
        "submitted_on": "2026-06-24",
        "amount_claimed": 420.0,
        "status": "waiting",
        "decision": None,
        "payout": None,
    }


def test_get_claim():
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["story"].startswith("My flight home from Rome")
    assert len(claim["documents"]) == 4
    assert claim["status"] == "waiting"
    assert claim["decision"] is None
    assert claim["payment"] is None
    assert claim["sign_off"] is None


def test_get_policy_with_plan_and_add_ons():
    policy = client.get("/api/policies/POL-2001").json()
    assert policy["plan_details"]["trip_delay_max"] == 800.0
    assert policy["add_on_details"] == []
    with_add_on = next(
        p for p in db.load("policies.json") if "electronics_plus" in p["add_ons"]
    )
    details = client.get(f"/api/policies/{with_add_on['policy_id']}").json()
    assert "electronics_per_item_limit" in str(details["add_on_details"])


def test_get_customer_with_history():
    customer = client.get("/api/customers/CUS-3001").json()
    assert customer["name"] == "Maya Patel"
    assert customer["previous_claims"][0]["claim_id"] == "CLM-0412"


def test_policy_wording_and_instructions():
    wording = client.get("/api/policy-wording").json()["policy_wording"]
    assert "## 10. How we work out your payment" in wording
    instructions = client.get("/api/instructions").json()["instructions"]
    assert instructions.startswith("# The UnderCover Agent")


def test_list_handlers():
    names = [h["name"] for h in client.get("/api/handlers").json()]
    assert names == ["Dana Whitfield", "Marcus Oyelaran", "Priya Raman"]


@pytest.mark.parametrize(
    "path",
    [
        "/api/claims/CLM-0000",
        "/api/policies/POL-0000",
        "/api/customers/CUS-0000",
        "/api/claims/CLM-0000/steps",
    ],
)
def test_not_found(path):
    assert client.get(path).status_code == 404


def test_the_answer_key_never_reaches_the_api():
    responses = [
        client.get("/api/claims").text,
        *(client.get(f"/api/claims/CLM-{n}").text for n in range(1001, 1026)),
        client.get("/api/policy-wording").text,
        client.get("/api/instructions").text,
    ]
    for field in ("calculation", "failure_class", "difficulty", "over_approval_limit"):
        assert not any(f'"{field}"' in text for text in responses)
    source = (db.ROOT / "backend" / "db.py").read_text()
    assert "evals" not in source
    assert "security" not in source


def test_every_operation_is_named_documented_and_required():
    for path in app.openapi()["paths"].values():
        for operation in path.values():
            assert operation["operationId"]
            assert operation["description"]
            for parameter in operation.get("parameters", []):
                assert parameter["required"], parameter["name"]
            body = operation.get("requestBody")
            if body:
                assert body["required"]
                ref = body["content"]["application/json"]["schema"]["$ref"]
                schema = app.openapi()["components"]["schemas"][ref.split("/")[-1]]
                assert set(schema["required"]) == set(schema["properties"])


def test_seed_is_only_run_once():
    client.get("/api/claims")
    conn = db.connect()
    assert conn.execute("SELECT count(*) FROM claims").fetchone()[0] == 25
