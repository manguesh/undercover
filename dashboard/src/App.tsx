import { useEffect, useState } from "react";
import { ClaimView } from "./ClaimView";
import { Instructions } from "./Instructions";
import { Queue } from "./Queue";

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => {
      setHash(window.location.hash);
    };
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("hashchange", update);
    };
  }, []);
  return hash;
}

function View({ hash }: Readonly<{ hash: string }>) {
  const claimId = /^#\/claims\/(.+)$/.exec(hash)?.[1];
  if (claimId) return <ClaimView key={claimId} claimId={claimId} />;
  if (hash === "#/instructions") return <Instructions />;
  return <Queue />;
}

export function App() {
  const hash = useHash();
  const onInstructions = hash === "#/instructions";

  return (
    <>
      <header className="header">
        <a className="brand" href="#/">
          UnderCover
        </a>
        <span className="tagline">Claims desk</span>
        <nav aria-label="Main">
          <a href="#/" aria-current={onInstructions ? undefined : "page"}>
            Queue
          </a>
          <a
            href="#/instructions"
            aria-current={onInstructions ? "page" : undefined}
          >
            Instructions
          </a>
        </nav>
      </header>
      <main>
        <View hash={hash} />
      </main>
    </>
  );
}
