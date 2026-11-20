import { api } from "./api";
import { usePoll } from "./usePoll";

export function Instructions() {
  const { data: instructions, error } = usePoll(api.getInstructions, 0);

  return (
    <>
      <div className="toolbar">
        <h1>The agent&apos;s instructions</h1>
        <span className="muted">Read only</span>
      </div>
      <div className="panel">
        {instructions ? (
          <pre className="instructions">{instructions}</pre>
        ) : (
          <p role="status">{error ?? "Loading the instructions…"}</p>
        )}
      </div>
    </>
  );
}
