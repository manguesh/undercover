import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from agent import main
from backend.main import app

client = TestClient(app)


class StubModel(GenericFakeChatModel):
    """A chat model that gives scripted replies in place of a real model."""

    def bind_tools(self, tools, **kwargs):
        return self


def calls(*tool_calls):
    """A scripted reply that calls each (name, args) tool in turn."""
    return AIMessage(
        content="",
        tool_calls=[
            {"name": name, "args": args, "id": str(n)}
            for n, (name, args) in enumerate(tool_calls)
        ],
    )


def stub(*replies):
    return StubModel(messages=iter(replies))


@pytest.fixture(autouse=True)
def backend(monkeypatch):
    monkeypatch.setattr(main, "backend", lambda: TestClient(app))


def decision(claim_id, payout):
    return {
        "claim_id": claim_id,
        "decision": "approve",
        "payout": payout,
        "reasons": "The flight was canceled for a crew problem. The costs are covered.",
        "policy_section": "Section 3, Trip Delay",
    }


def test_run_decides_and_pays_a_claim():
    client.post("/api/claims/CLM-1001/start")
    llm = stub(
        calls(("get_claim", {"claim_id": "CLM-1001"})),
        calls(
            ("get_policy", {"policy_id": "POL-2001"}),
            ("get_customer", {"customer_id": "CUS-3001"}),
            ("get_policy_wording", {}),
        ),
        calls(("record_decision", decision("CLM-1001", 420.0))),
        calls(("pay_claim", {"claim_id": "CLM-1001", "amount": 420.0})),
        AIMessage(content="Approved and paid $420.00."),
    )
    assert main.run("CLM-1001", "thread-1", llm) == "Approved and paid $420.00."

    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["status"] == "decided"
    assert claim["payment"]["amount"] == 420.0
    steps = client.get("/api/claims/CLM-1001/steps").json()
    calls_made = [s["text"].split("(")[0] for s in steps if s["kind"] == "tool_call"]
    assert calls_made == [
        "get_claim",
        "get_policy",
        "get_customer",
        "get_policy_wording",
        "record_decision",
        "pay_claim",
    ]
    assert steps[1]["text"].startswith("get_claim: {")
    assert steps[1]["text"].endswith("…")
    assert steps[-1] == {
        **steps[-1],
        "kind": "message",
        "text": "Approved and paid $420.00.",
    }


def test_the_backend_refuses_a_payment_that_needs_sign_off():
    client.post("/api/claims/CLM-1002/start")
    llm = stub(
        calls(("record_decision", decision("CLM-1002", 1250.0))),
        calls(("pay_claim", {"claim_id": "CLM-1002", "amount": 1250.0})),
        AIMessage(content="Approved; the payment waits for sign-off."),
    )
    main.run("CLM-1002", "thread-2", llm)

    claim = client.get("/api/claims/CLM-1002").json()
    assert claim["status"] == "awaiting_signoff"
    assert claim["payment"] is None
    results = [
        s["text"]
        for s in client.get("/api/claims/CLM-1002/steps").json()
        if s["kind"] == "tool_result"
    ]
    assert results[-1].startswith("pay_claim: Refused (403)")


def test_model_name(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.delenv("MODEL_NAME", raising=False)
    assert main.model().model_name == "openai/gpt-6-luna"
    monkeypatch.setenv("MODEL_NAME", "openrouter/free")
    assert main.model().model_name == "openrouter/free"


def test_shorten():
    assert main.shorten("short") == "short"
    assert len(main.shorten("x" * 1000)) == main.RESULT_LENGTH + 1
