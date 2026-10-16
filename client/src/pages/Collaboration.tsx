import { useState } from "react";
import "./Collaboration.css";

const quartermarkLogo = "/assets/civicpath-quartermark.png";

const outcomes = [
  {
    number: "01",
    title: "Keep the delivery context with the work",
    body: "Record the request, evidence, decision rationale and accountable next step beside the action—not in a separate inbox or a departing staff member’s memory.",
  },
  {
    number: "02",
    title: "Make review meetings decision-ready",
    body: "Bring current actions, dependencies, funding checkpoints and questions into one internal Review Pack before the meeting begins.",
  },
  {
    number: "03",
    title: "Create clearer follow-through across teams",
    body: "Use ownership requests, review steps and handovers to make the right next move visible, accepted and easier to complete.",
  },
];

const rhythm = [
  ["Weekly", "Delivery huddle", "Open requests, blockers, handovers and the next seven-day moves."],
  ["Monthly", "Leadership review", "Material dependencies, funding readiness and decisions needing direction."],
  ["Quarterly", "Executive review", "Endorsed updates, decision questions, risks and owned follow-through."],
  ["When needed", "Funding checkpoint", "Eligibility, evidence, partner contributions and submission readiness."],
];

const boundaries = [
  ["Internal-first", "Collaboration is kept inside the authenticated Council workspace. It does not rely on external partner logins or public links."],
  ["Structured, not noisy", "Working notes, requests and Review Packs preserve the useful context without turning CivicPath into another stream of notifications."],
  ["Ready for governance", "Reviewed quarterly updates, accountable handovers and recorded outcomes provide a more dependable trail into leadership and Council discussions."],
];

export default function Collaboration() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <main className="collaboration-marketing">
    <header className="site-header collaboration-header">
      <a className="brand" href="/" aria-label="CivicPath home"><img src={quartermarkLogo} alt="CivicPath logo" /><span>CivicPath</span></a>
      <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="collaboration-site-nav"><span>{menuOpen ? "Close" : "Menu"}</span></button>
      <nav id="collaboration-site-nav" className={menuOpen ? "site-nav is-open" : "site-nav"} aria-label="Primary navigation">
        <a href="/#workflow" onClick={() => setMenuOpen(false)}>How it works</a>
        <a className="is-current" href="/collaboration" aria-current="page" onClick={() => setMenuOpen(false)}>Collaboration</a>
        <a href="/#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
        <a href="/#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
        <a className="nav-cta" href="/contact" onClick={() => setMenuOpen(false)}>Discuss a Council Proof <span>↗</span></a>
      </nav>
    </header>

    <section className="collaboration-hero">
      <div className="collaboration-hero-copy">
        <p className="eyebrow light"><span className="route-dot" /> A more connected path to delivery</p>
        <h1>Make the work behind a Council project <em>easier to carry together.</em></h1>
        <p>New internal collaboration areas in CivicPath help teams preserve context, coordinate contributions and take clearer decisions without adding another disconnected tool to the day.</p>
        <div className="hero-actions"><a className="button button-primary" href="/contact">Explore a Council Proof <span>→</span></a><a className="text-link" href="#outcomes">See the outcomes <span>↓</span></a></div>
        <p className="collaboration-hero-note">Built for the everyday handovers, reviews and cross-team decisions that shape regional Council delivery.</p>
      </div>
      <div className="collaboration-board" aria-label="Illustrative CivicPath internal Review Pack">
        <div className="board-topline"><span>Internal Review Pack</span><b>Quarterly executive review</b></div>
        <div className="board-title"><span className="board-mark">CP</span><div><strong>Regional growth actions</strong><small>Prepared for internal review</small></div><i>•••</i></div>
        <div className="board-signal"><div><span>Decision required</span><b>Confirm next delivery pathway</b></div><em>Open</em></div>
        <div className="board-list">
          <div><span className="board-dot green" /><p><b>Evidence update endorsed</b><small>Action 2.3 · Economic development</small></p><i>↗</i></div>
          <div><span className="board-dot amber" /><p><b>Funding checkpoint due</b><small>Owner confirmed · 7 days</small></p><i>→</i></div>
          <div><span className="board-dot teal" /><p><b>Partner commitment recorded</b><small>Co-delivery contribution</small></p><i>✓</i></div>
        </div>
        <div className="board-footer"><span>3 records included</span><b>Internal only</b></div>
      </div>
      <div className="collaboration-route" aria-hidden="true"><span>Priority</span><i /><span>Action</span><i /><b>Shared next move</b></div>
    </section>

    <section className="collaboration-statement" id="outcomes">
      <div className="section-marker"><span>01</span><i /></div>
      <div><p className="eyebrow">The outcome of better collaboration</p><h2>Less time reconstructing the story. More time moving the right work forward.</h2></div>
      <p>For regional Council teams, collaboration is not about adding chat for its own sake. It is about making responsibilities, evidence, decisions and follow-through easier to see when projects cross teams, reporting cycles and staff changes.</p>
    </section>

    <section className="collaboration-outcomes">
      <div className="collaboration-outcome-grid">{outcomes.map((outcome) => <article key={outcome.number}><span>{outcome.number}</span><h3>{outcome.title}</h3><p>{outcome.body}</p><i /></article>)}</div>
    </section>

    <section className="collaboration-rhythm-section">
      <div className="section-intro collaboration-intro"><div className="section-marker"><span>02</span><i /></div><div><p className="eyebrow">One calm operating rhythm</p><h2>Use the same delivery picture in the meeting—and after it.</h2></div><p className="intro-note">CivicPath brings the delivery records into the practical conversations where a Council needs to agree a next move, rather than rebuilding updates into a new briefing each time.</p></div>
      <div className="collaboration-rhythm-grid">{rhythm.map(([cadence, title, body]) => <article key={title}><p>{cadence}</p><h3>{title}</h3><span>{body}</span></article>)}</div>
    </section>

    <section className="collaboration-review-section">
      <div className="review-copy"><div className="section-marker"><span>03</span><i /></div><p className="eyebrow">Internal Review Packs</p><h2>Arrive at the meeting with the question, context and ownership already clear.</h2><p>A Review Pack can assemble current actions, material dependencies, included quarterly updates, risks, funding positions and follow-up questions into a concise internal agenda.</p><ul><li>Record the decision or question before the meeting.</li><li>Keep the relevant evidence and delivery position close by.</li><li>Assign a follow-up owner and connect the outcome back to the live action.</li></ul><a className="text-link strong" href="/contact">Discuss collaboration for your Council <span>→</span></a></div>
      <div className="review-framework" aria-label="Review Pack workflow">
        <div className="framework-head"><img src={quartermarkLogo} alt="" /><span>Internal only</span></div>
        <div className="framework-question"><p>Question for review</p><b>What needs to be agreed to keep this action on track?</b></div>
        <div className="framework-rows"><div><span>01</span><p><b>Delivery evidence</b><small>Latest reviewed update and evidence summary</small></p></div><div><span>02</span><p><b>Material dependencies</b><small>Owner, handover state and required decision</small></p></div><div><span>03</span><p><b>Follow-through</b><small>Outcome, accountable owner and practical due date</small></p></div></div>
        <div className="framework-footer"><span>Review → record → act</span><b>CP</b></div>
      </div>
    </section>

    <section className="collaboration-boundaries">
      <div className="section-intro collaboration-intro"><div className="section-marker"><span>04</span><i /></div><div><p className="eyebrow">Purposeful by design</p><h2>Collaboration that respects Council governance and capacity.</h2></div></div>
      <div className="collaboration-boundary-grid">{boundaries.map(([title, body], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>

    <section className="collaboration-cta"><p className="eyebrow light">See it with a live portfolio</p><h2>Bring the people, decisions and next moves into the same practical view.</h2><p>Start with a focused Council Proof and explore the collaboration rhythm around work your Council is already progressing.</p><a className="button button-light" href="/contact">Discuss a Council Proof <span>→</span></a></section>

    <footer className="site-footer"><a className="brand" href="/"><img src={quartermarkLogo} alt="CivicPath logo" /><span>CivicPath</span></a><p>Strategic project readiness and connected delivery for regional councils.</p></footer>
  </main>;
}
