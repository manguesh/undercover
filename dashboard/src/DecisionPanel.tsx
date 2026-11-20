import { useState } from "react";
import { api, type Claim } from "./api";
import { DECISION_LABELS, day, money } from "./format";
import { usePoll } from "./usePoll";

interface Props {
  claim: Claim;
  onChange: () => void;
}

function SignOff({ claim, onChange }: Readonly<Props>) {
  const { data: handlers } = usePoll(api.listHandlers, 0);
  const [handlerId, setHandlerId] = useState("");
  const [error, setError] = useState<string>();

  const signOff = () => {
    api.signOff(claim.claim_id, handlerId).then(onChange, (reason: unknown) => {
      setError(String(reason));
    });
  };

  return (
    <>
      <p className="notice">
        The payout is over the approval limit, so the payment waits for a
        handler to sign off.
      </p>
      <div className="sign-off">
        <label htmlFor="handler">Handler</label>
        <select
          id="handler"
          value={handlerId}
          onChange={(event) => {
            setHandlerId(event.target.value);
          }}
        >
          <option value="">Choose a handler</option>
          {handlers?.map((handler) => (
            <option key={handler.handler_id} value={handler.handler_id}>
              {handler.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={signOff} disabled={!handlerId}>
          Sign off and pay
        </button>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function DecisionPanel({ claim, onChange }: Readonly<Props>) {
  const [error, setError] = useState<string>();
  const { decision, payment, sign_off: signOff } = claim;

  const run = () => {
    setError(undefined);
    api.runClaim(claim.claim_id).then(onChange, (reason: unknown) => {
      setError(String(reason));
    });
  };

  return (
    <section className="panel" aria-labelledby="decision-heading">
      <h2 id="decision-heading">Decision</h2>
      {decision ? (
        <>
          <p className={`decision-${decision.decision}`}>
            <strong>{DECISION_LABELS[decision.decision]}</strong>
          </p>
          <p className="payout mono">{money(decision.payout)}</p>
          <p>{decision.reasons}</p>
          <p className="muted">{decision.policy_section}</p>
        </>
      ) : (
        <p className="muted">
          {claim.status === "in_progress"
            ? "The agent is working on this claim."
            : "No decision yet."}
        </p>
      )}
      {claim.status === "waiting" && (
        <div>
          <button type="button" onClick={run}>
            Run the agent
          </button>
        </div>
      )}
      {claim.status === "awaiting_signoff" && (
        <SignOff claim={claim} onChange={onChange} />
      )}
      {payment && (
        <p>
          Paid <span className="mono">{money(payment.amount)}</span> on{" "}
          {day(payment.paid_at)}
          {signOff && `, signed off by ${signOff.handler_name}`}.
        </p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
