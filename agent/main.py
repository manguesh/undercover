"""The UnderCover Agent."""

import json
import os
from typing import Literal

import httpx
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

load_dotenv(override=True)

BACKEND_URL = "http://localhost:8000"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-6-luna"
RESULT_LENGTH = 300


def backend() -> httpx.Client:
    """Return a client for the UnderCover backend."""
    return httpx.Client(base_url=BACKEND_URL, timeout=30)


def call(method: str, path: str, body: dict[str, object] | None = None) -> str:
    """Call the backend and return its reply, or why it refused."""
    with backend() as client:
        response = client.request(method, path, json=body)
    if response.is_success:
        return response.text
    return f"Refused ({response.status_code}): {response.text}"


@tool
def get_claim(claim_id: str) -> str:
    """Get a claim: the customer's story, the items claimed and the documents."""
    return call("GET", f"/api/claims/{claim_id}")


@tool
def get_policy(policy_id: str) -> str:
    """Get a policy: the plan and its limits, the add-ons, the trip and travelers."""
    return call("GET", f"/api/policies/{policy_id}")


@tool
def get_customer(customer_id: str) -> str:
    """Get a customer, with their earlier claims."""
    return call("GET", f"/api/customers/{customer_id}")


@tool
def get_policy_wording() -> str:
    """Get the policy wording: what the policy covers and how payouts are worked out."""
    return json.loads(call("GET", "/api/policy-wording"))["policy_wording"]


@tool
def record_decision(
    claim_id: str,
    decision: Literal["approve", "decline", "refer"],
    payout: float,
    reasons: str,
    policy_section: str,
) -> str:
    """Record your decision on a claim: the payout (0 unless approved), two or
    three sentences of reasons, and the section of the policy wording it rests on."""
    return call(
        "POST",
        f"/api/claims/{claim_id}/decision",
        {
            "decision": decision,
            "payout": payout,
            "reasons": reasons,
            "policy_section": policy_section,
        },
    )


@tool
def pay_claim(claim_id: str, amount: float) -> str:
    """Pay an approved claim its approved payout."""
    return call("POST", f"/api/claims/{claim_id}/payments", {"amount": amount})


TOOLS = [
    get_claim,
    get_policy,
    get_customer,
    get_policy_wording,
    record_decision,
    pay_claim,
]


def model() -> ChatOpenAI:
    """Return the model named in MODEL_NAME, or GPT-6 Luna by default."""
    name = os.getenv("MODEL_NAME")
    return ChatOpenAI(
        model=name or DEFAULT_MODEL,
        base_url=OPENROUTER_BASE_URL,
        api_key=SecretStr(os.environ["OPENROUTER_API_KEY"]),
        reasoning_effort=None if name else "low",
    )


def add_step(claim_id: str, kind: str, text: str) -> None:
    """Record a step on the claim, for the dashboard to show."""
    call("POST", f"/api/claims/{claim_id}/steps", {"kind": kind, "text": text})


def shorten(text: str) -> str:
    """Cut a long tool result down for the dashboard."""
    return text if len(text) <= RESULT_LENGTH else text[:RESULT_LENGTH] + "…"


def record(claim_id: str, message: BaseMessage) -> None:
    """Record the tool calls, tool results and replies in one message as steps."""
    if isinstance(message, ToolMessage):
        add_step(claim_id, "tool_result", f"{message.name}: {shorten(message.text)}")
        return
    if isinstance(message, AIMessage):
        for tool_call in message.tool_calls:
            add_step(
                claim_id,
                "tool_call",
                f"{tool_call['name']}({json.dumps(tool_call['args'])})",
            )
        if message.text:
            add_step(claim_id, "message", message.text)


def run(claim_id: str, thread_id: str, llm: BaseChatModel | None = None) -> str:
    """Run the agent on one claim, record each step, and return its final reply."""
    instructions = json.loads(call("GET", "/api/instructions"))["instructions"]
    agent = create_agent(llm or model(), tools=TOOLS, system_prompt=instructions)
    reply = ""
    for update in agent.stream(
        {"messages": [{"role": "user", "content": f"Claim {claim_id}"}]},
        config={"configurable": {"thread_id": thread_id}},
        stream_mode="updates",
    ):
        for node in update.values():
            for message in node["messages"]:
                record(claim_id, message)
                if isinstance(message, AIMessage) and message.text:
                    reply = message.text
    return reply
