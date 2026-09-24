import { useEffect, useRef, useState } from "react";
import "altcha";

type Props = {
  challengeUrl: string;
  onVerified: (payload: string) => void;
};

export function AltchaVerification({ challengeUrl, onVerified }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onVerified);
  const [state, setState] = useState("loading");

  useEffect(() => { callbackRef.current = onVerified; }, [onVerified]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const widget = document.createElement("altcha-widget");
    widget.setAttribute("challenge", challengeUrl);
    widget.setAttribute("auto", "onload");
    widget.setAttribute("name", "altcha");
    widget.setAttribute("theme", "light");
    const verified = (event: Event) => {
      const detail = event as CustomEvent<{ payload?: string }>;
      setState("verified");
      callbackRef.current(detail.detail?.payload || "");
    };
    const stateChanged = (event: Event) => {
      const detail = event as CustomEvent<{ state?: string }>;
      const nextState = detail.detail?.state || "loading";
      setState(nextState);
      if (nextState !== "verified") callbackRef.current("");
    };
    widget.addEventListener("verified", verified);
    widget.addEventListener("statechange", stateChanged);
    container.appendChild(widget);
    return () => {
      widget.removeEventListener("verified", verified);
      widget.removeEventListener("statechange", stateChanged);
      widget.remove();
    };
  }, [challengeUrl]);

  return <div className="contact-verification"><div ref={containerRef} /><p className={state === "verified" ? "is-verified" : ""}>{state === "verified" ? "Verification complete." : "Completing a privacy-friendly verification check…"}</p></div>;
}
