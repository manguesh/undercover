import pytest
from fastapi.testclient import TestClient

from backend import main
from backend.main import app

client = TestClient(app)


def refer(claim_id, thread_id):
    client.post(
        f"/api/claims/{claim_id}/decision",
        json={
            "decision": "refer",
            "payout": 0,
            "reasons": "A handler needs to look at this.",
            "policy_section": "Section 11, How to claim",
        },
    )


def fail(claim_id, thread_id):
    raise RuntimeError("the model is down")


def give_up(claim_id, thread_id):
    return "I could not decide."


@pytest.fixture
def agent(monkeypatch):
    runs = []

    def use(fake):
        def record(claim_id, thread_id):
            runs.append((claim_id, thread_id))
            return fake(claim_id, thread_id)

        monkeypatch.setattr(main, "run_agent", record)
        return runs

    return use


def test_run_claim_runs_the_agent(agent):
    runs = agent(refer)
    response = client.post("/api/claims/CLM-1001/run")
    assert response.json()["status"] == "in_progress"
    assert runs[0][0] == "CLM-1001"
    assert runs[0][1].startswith("CLM-1001-")
    assert client.get("/api/claims/CLM-1001").json()["status"] == "decided"
    assert client.get("/api/claims/CLM-1001/steps").json() == []


def test_a_failed_run_puts_the_claim_back(agent):
    agent(fail)
    client.post("/api/claims/CLM-1001/run")
    assert client.get("/api/claims/CLM-1001").json()["status"] == "waiting"
    steps = client.get("/api/claims/CLM-1001/steps").json()
    assert steps[-1]["kind"] == "error"
    assert steps[-1]["text"] == "The agent stopped with an error: the model is down"


def test_a_run_without_a_decision_puts_the_claim_back(agent):
    agent(give_up)
    client.post("/api/claims/CLM-1001/run")
    assert client.get("/api/claims/CLM-1001").json()["status"] == "waiting"
    steps = client.get("/api/claims/CLM-1001/steps").json()
    assert steps[-1]["text"] == "The agent finished without recording a decision."


def test_run_claim_needs_a_waiting_claim(agent):
    runs = agent(refer)
    client.post("/api/claims/CLM-1001/start")
    assert client.post("/api/claims/CLM-1001/run").status_code == 409
    assert runs == []


def test_run_queue_works_every_waiting_claim(agent):
    runs = agent(refer)
    client.post("/api/claims/CLM-1003/start")
    assert client.post("/api/queue/run").json() == {"claims": 24}
    assert len(runs) == 24
    assert "CLM-1003" not in [claim_id for claim_id, _ in runs]
    statuses = {c["claim_id"]: c["status"] for c in client.get("/api/claims").json()}
    assert statuses["CLM-1003"] == "in_progress"
    assert {s for c, s in statuses.items() if c != "CLM-1003"} == {"decided"}


def test_run_queue_skips_a_claim_taken_meanwhile(agent):
    runs = agent(refer)
    main.work_queue(["CLM-1001", "CLM-1001"])
    assert len(runs) == 1
