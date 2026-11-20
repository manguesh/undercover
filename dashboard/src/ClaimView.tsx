import { useCallback } from "react";
import { api, type Claim } from "./api";
import { DecisionPanel } from "./DecisionPanel";
import { day, money, words } from "./format";
import { StateChip } from "./StateChip";
import { Steps } from "./Steps";
import { POLL_MS, usePoll } from "./usePoll";

function PolicyPanel({ policyId }: Readonly<{ policyId: string }>) {
  const load = useCallback(() => api.getPolicy(policyId), [policyId]);
  const { data: policy } = usePoll(load, 0);
  if (!policy) return null;
  const addOns = policy.add_on_details.map((addOn) => addOn.name).join(", ");

  return (
    <section className="panel" aria-labelledby="policy-heading">
      <h2 id="policy-heading">
        Policy <span className="mono muted">{policy.policy_id}</span>
      </h2>
      <dl className="facts">
        <dt>Plan</dt>
        <dd>{policy.plan_details.name}</dd>
        <dt>Add-ons</dt>
        <dd>{addOns || "None"}</dd>
        <dt>Trip</dt>
        <dd>
          {policy.trip.destination}, {day(policy.trip.departs_on)} to{" "}
          {day(policy.trip.returns_on)}
        </dd>
        <dt>Trip cost</dt>
        <dd className="mono">{money(policy.trip.trip_cost)}</dd>
        <dt>Travelers</dt>
        <dd>{policy.travelers.join(", ")}</dd>
        <dt>Bought</dt>
        <dd>{day(policy.purchased_on)}</dd>
      </dl>
    </section>
  );
}

function CustomerPanel({ customerId }: Readonly<{ customerId: string }>) {
  const load = useCallback(() => api.getCustomer(customerId), [customerId]);
  const { data: customer } = usePoll(load, 0);
  if (!customer) return null;

  return (
    <section className="panel" aria-labelledby="customer-heading">
      <h2 id="customer-heading">
        {customer.name}{" "}
        <span className="mono muted">{customer.customer_id}</span>
      </h2>
      <p className="muted">Customer since {day(customer.customer_since)}</p>
      <h3>Earlier claims</h3>
      {customer.previous_claims.length ? (
        <ul className="documents">
          {customer.previous_claims.map((previous) => (
            <li key={previous.claim_id}>
              <span className="mono">{previous.claim_id}</span>,{" "}
              {day(previous.filed_on)}: {previous.summary}.{" "}
              {words(previous.outcome)}, paid{" "}
              <span className="mono">{money(previous.amount_paid)}</span>.
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">None.</p>
      )}
    </section>
  );
}

function ClaimPanels({ claim }: Readonly<{ claim: Claim }>) {
  return (
    <div className="grid">
      <section className="panel" aria-labelledby="claim-heading">
        <h2 id="claim-heading">The claim</h2>
        <dl className="facts">
          <dt>Type</dt>
          <dd>{words(claim.claim_type)}</dd>
          <dt>Incident</dt>
          <dd>
            {day(claim.incident_date)}, {claim.incident_location}
          </dd>
          <dt>Submitted</dt>
          <dd>{day(claim.submitted_on)}</dd>
        </dl>
        <blockquote className="story">{claim.story}</blockquote>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th className="number">Amount</th>
            </tr>
          </thead>
          <tbody>
            {claim.items.map((item) => (
              <tr key={item.description}>
                <td>{item.description}</td>
                <td>{words(item.category)}</td>
                <td className="number mono">{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2}>Claimed</th>
              <td className="number mono">{money(claim.amount_claimed)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
      <section className="panel" aria-labelledby="documents-heading">
        <h2 id="documents-heading">Documents</h2>
        <ul className="documents">
          {claim.documents.map((document) => (
            <li key={document.name}>
              <strong>{document.name}</strong>{" "}
              <span className="muted">{words(document.type)}</span>
              <p>{document.content}</p>
            </li>
          ))}
        </ul>
      </section>
      <PolicyPanel policyId={claim.policy_id} />
      <CustomerPanel customerId={claim.customer_id} />
    </div>
  );
}

export function ClaimView({ claimId }: Readonly<{ claimId: string }>) {
  const load = useCallback(() => api.getClaim(claimId), [claimId]);
  const { data: claim, error, reload } = usePoll(load, POLL_MS);

  if (!claim) {
    return <p role="status">{error ?? "Loading the claim…"}</p>;
  }

  return (
    <>
      <a href="#/">Back to the queue</a>
      <div className="toolbar">
        <h1>
          <span className="mono">{claim.claim_id}</span> {claim.summary}
        </h1>
        <StateChip status={claim.status} />
      </div>
      <div className="grid">
        <DecisionPanel claim={claim} onChange={reload} />
        <Steps claimId={claimId} />
      </div>
      <ClaimPanels claim={claim} />
    </>
  );
}
