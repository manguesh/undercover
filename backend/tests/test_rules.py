import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def decide(claim_id, decision="approve", payout=420.0):
    client.post(f"/api/claims/{claim_id}/start")
    return client.post(
        f"/api/claims/{claim_id}/decision",
        json={
            "decision": decision,
            "payout": payout,
            "reasons": "The delay is covered.",
            "policy_section": "Section 3, Trip Delay",
        },
    )


def pay(claim_id, amount):
    return client.post(f"/api/claims/{claim_id}/payments", json={"amount": amount})


def test_start_claim():
    assert client.post("/api/claims/CLM-1001/start").json()["status"] == "in_progress"
    again = client.post("/api/claims/CLM-1001/start")
    assert again.status_code == 409
    assert again.json()["detail"] == "CLM-1001 is in_progress, not waiting"


def test_approval_within_the_limit_is_decided_and_paid():
    claim = decide("CLM-1001").json()
    assert claim["status"] == "decided"
    assert claim["decision"]["payout"] == 420.0
    assert claim["decision"]["policy_section"] == "Section 3, Trip Delay"
    paid = pay("CLM-1001", 420.0)
    assert paid.status_code == 200
    assert paid.json()["payment"]["amount"] == 420.0
    assert client.get("/api/claims").json()[0]["decision"] == "approve"


def test_approval_over_the_limit_waits_for_sign_off():
    assert decide("CLM-1002", payout=1250.0).json()["status"] == "awaiting_signoff"
    refused = pay("CLM-1002", 1250.0)
    assert refused.status_code == 403
    assert "sign-off" in refused.json()["detail"]
    assert client.get("/api/claims/CLM-1002").json()["payment"] is None

    signed = client.post(
        "/api/claims/CLM-1002/sign-off", json={"handler_id": "HND-01"}
    ).json()
    assert signed["status"] == "decided"
    assert signed["payment"]["amount"] == 1250.0
    assert signed["sign_off"]["handler_name"] == "Dana Whitfield"


def test_a_payout_of_exactly_the_limit_needs_no_sign_off():
    assert decide("CLM-1003", payout=1000.0).json()["status"] == "decided"
    assert pay("CLM-1003", 1000.0).status_code == 200


@pytest.mark.parametrize("decision", ["decline", "refer"])
def test_decline_and_refer_are_decided_with_no_payout(decision):
    claim = decide("CLM-1004", decision, 0).json()
    assert claim["status"] == "decided"
    refused = pay("CLM-1004", 10.0)
    assert refused.status_code == 409
    assert refused.json()["detail"] == "CLM-1004 has no approval to pay"


def test_a_decline_with_a_payout_is_refused():
    response = decide("CLM-1004", "decline", 50.0)
    assert response.status_code == 422
    assert client.get("/api/claims/CLM-1004").json()["status"] == "in_progress"


def test_paying_the_wrong_amount_or_twice_is_refused():
    decide("CLM-1001")
    wrong = pay("CLM-1001", 500.0)
    assert wrong.status_code == 409
    assert wrong.json()["detail"] == "The approved payout for CLM-1001 is $420.00"
    assert pay("CLM-1001", 420.0).status_code == 200
    assert pay("CLM-1001", 420.0).status_code == 409


def test_a_decision_needs_a_claim_in_progress():
    response = client.post(
        "/api/claims/CLM-1001/decision",
        json={
            "decision": "approve",
            "payout": 420.0,
            "reasons": "Covered.",
            "policy_section": "Section 3",
        },
    )
    assert response.status_code == 409
    assert client.get("/api/claims/CLM-1001").json()["decision"] is None


def test_sign_off_needs_a_claim_awaiting_sign_off_and_a_real_handler():
    decide("CLM-1001")
    not_waiting = client.post(
        "/api/claims/CLM-1001/sign-off", json={"handler_id": "HND-01"}
    )
    assert not_waiting.status_code == 409
    decide("CLM-1002", payout=2000.0)
    stranger = client.post(
        "/api/claims/CLM-1002/sign-off", json={"handler_id": "HND-99"}
    )
    assert stranger.status_code == 404


def test_steps_come_back_in_order():
    for n in range(3):
        client.post(
            "/api/claims/CLM-1001/steps", json={"kind": "message", "text": f"Step {n}"}
        )
    steps = client.get("/api/claims/CLM-1001/steps").json()
    assert [s["text"] for s in steps] == ["Step 0", "Step 1", "Step 2"]
    assert client.get("/api/claims/CLM-1002/steps").json() == []
    unknown = client.post(
        "/api/claims/CLM-0000/steps", json={"kind": "message", "text": "Hello"}
    )
    assert unknown.status_code == 404
