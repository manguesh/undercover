import { useCallback } from "react";
import { api, type Step } from "./api";
import { POLL_MS, usePoll } from "./usePoll";

const KIND_LABELS: Record<Step["kind"], string> = {
  tool_call: "Calls",
  tool_result: "Gets back",
  message: "Says",
  error: "Error",
};

export function Steps({ claimId }: Readonly<{ claimId: string }>) {
  const load = useCallback(() => api.listSteps(claimId), [claimId]);
  const { data: steps } = usePoll(load, POLL_MS);

  return (
    <section className="panel" aria-labelledby="steps-heading">
      <h2 id="steps-heading">What the agent did</h2>
      {steps?.length ? (
        <ol className="steps">
          {steps.map((step) => (
            <li
              key={step.step_id}
              className={step.kind === "error" ? "step-error" : undefined}
            >
              <span className="muted">{KIND_LABELS[step.kind]}</span>
              <span
                className={step.kind === "tool_call" ? "text mono" : "text"}
              >
                {step.text}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">The agent hasn&apos;t worked on this claim yet.</p>
      )}
    </section>
  );
}
