import { useState } from "react";
import { api } from "./api";
import { DECISION_LABELS, STATUSES, day, money, words } from "./format";
import { StateChip } from "./StateChip";
import { POLL_MS, usePoll } from "./usePoll";

export function Queue() {
  const { data: claims, error, reload } = usePoll(api.listClaims, POLL_MS);
  const [message, setMessage] = useState<string>();

  if (!claims) {
    return <p role="status">{error ?? "Loading the queue…"}</p>;
  }

  const waiting = claims.filter((claim) => claim.status === "waiting").length;

  const workTheQueue = () => {
    api.runQueue().then(
      ({ claims: count }) => {
        setMessage(`The agent is working through ${String(count)} claims.`);
        reload();
      },
      (reason: unknown) => {
        setMessage(String(reason));
      },
    );
  };

  return (
    <>
      <div className="toolbar">
        <h1>Claims queue</h1>
        <button type="button" onClick={workTheQueue} disabled={!waiting}>
          Work the queue
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      <ul className="counts" aria-label="Claims by state">
        {STATUSES.map((status) => (
          <li key={status}>
            <StateChip status={status} />
            <span className="mono">
              {claims.filter((claim) => claim.status === status).length}
            </span>
          </li>
        ))}
      </ul>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Claim</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Submitted</th>
              <th className="number">Claimed</th>
              <th>State</th>
              <th>Decision</th>
              <th className="number">Payout</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((claim) => (
              <tr key={claim.claim_id}>
                <td>
                  <a className="mono" href={`#/claims/${claim.claim_id}`}>
                    {claim.claim_id}
                  </a>
                </td>
                <td>
                  {claim.customer_name}
                  <div className="muted">{claim.summary}</div>
                </td>
                <td>{words(claim.claim_type)}</td>
                <td className="nowrap">{day(claim.submitted_on)}</td>
                <td className="number mono">{money(claim.amount_claimed)}</td>
                <td>
                  <StateChip status={claim.status} />
                </td>
                <td>{claim.decision && DECISION_LABELS[claim.decision]}</td>
                <td className="number mono">
                  {claim.payout !== null && money(claim.payout)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
