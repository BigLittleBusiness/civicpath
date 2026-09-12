// DESIGN: Civic Field Manual — grounded regional civic design, river-slate surfaces, eucalypt signals and a practical route from priority to delivery.
import { useState } from "react";

const gateLogo = "/manus-storage/civicpath_gate_placeholder_60270a68.png";
const heroImage = "/manus-storage/civicpath_hero_regional_strategy_e419c57c.jpg";
const readinessImage = "/manus-storage/civicpath_project_readiness_17ee2fdd.jpg";
const workshopImage = "/manus-storage/civicpath_partnership_workshop_4462148b.jpg";

const workflow = [
  {
    number: "01",
    title: "Set the project context",
    body: "Connect an adopted priority, project owner, expected outcome and the evidence that explains why the work matters.",
  },
  {
    number: "02",
    title: "See readiness clearly",
    body: "Assess the practical conditions for progress: scope, cost, approvals, partners, co-contribution and delivery capacity.",
  },
  {
    number: "03",
    title: "Create the funding path",
    body: "Record suitable programs, next actions and key dates without turning every project into a grant application too early.",
  },
  {
    number: "04",
    title: "Move decisions forward",
    body: "Give leaders a shared view of risks, decisions and blockers across the portfolio before they slow delivery.",
  },
];

const modules = [
  ["Portfolio register", "One reliable view of live strategic projects, owners and next moves."],
  ["Readiness assessment", "A consistent way to identify what is ready, what needs work and why."],
  ["Funding pathways", "Practical matching between project intent, funder fit and action timing."],
  ["Actions, risks & decisions", "Clear accountability for the work that unlocks project progress."],
  ["Executive briefings", "A concise portfolio view for the decisions leaders need to make."],
  ["Exportable evidence", "Meeting-ready summaries without rebuilding the story in a new spreadsheet."],
];

const pricing = [
  {
    name: "Council Proof",
    price: "$1,200",
    term: "for 60 days",
    description: "A focused test with one live portfolio—not a generic software trial.",
    points: ["Up to 15 live projects", "Readiness and funding pathways", "Remote setup and practical training"],
    accent: "sand",
  },
  {
    name: "Essentials",
    price: "$2,500",
    term: "per year",
    description: "For a single strategy, grants, economic development or infrastructure team.",
    points: ["One portfolio · 20 active projects", "Three workflow users", "Unlimited Executive read-only access"],
    accent: "green",
  },
  {
    name: "Core",
    price: "$5,000",
    term: "per year",
    description: "For connected teams managing several strategic portfolios.",
    points: ["Up to 3 portfolios · 75 active projects", "Eight workflow users", "Standard imports, reporting and support"],
    accent: "slate",
  },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="CivicPath home">
          <img src={gateLogo} alt="CivicPath Gate logo placeholder" />
          <span>CivicPath</span>
        </a>
        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="site-nav">
          <span>{menuOpen ? "Close" : "Menu"}</span>
        </button>
        <nav id="site-nav" className={menuOpen ? "site-nav is-open" : "site-nav"} aria-label="Primary navigation">
          <a href="#workflow" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#councils" onClick={() => setMenuOpen(false)}>For councils</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
          <a className="nav-cta" href="#proof" onClick={() => setMenuOpen(false)}>Explore a Council Proof <span>↗</span></a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-image" style={{ backgroundImage: `url(${heroImage})` }} aria-hidden="true" />
        <div className="hero-copy route-section">
          <p className="eyebrow"><span className="route-dot" /> A clearer path for regional councils</p>
          <h1>Turn strategic priorities into <em>delivery-ready</em> projects.</h1>
          <p className="hero-lead">CivicPath gives regional council teams a shared way to see project readiness, funding pathways, decisions and the next practical move.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#proof">Explore a Council Proof <span>→</span></a>
            <a className="text-link" href="#workflow">See the workflow <span>↓</span></a>
          </div>
          <p className="hero-note">Built for councils balancing growth, grants and delivery with limited capacity.</p>
        </div>
        <div className="hero-field-note" aria-label="CivicPath field note">
          <div className="field-note-head"><img src={gateLogo} alt="" /><span>Field note / 01</span></div>
          <p>Every live project needs a visible next move.</p>
          <div><b>Scope</b><b>Readiness</b><b className="decision-word">Decision</b></div>
        </div>
        <aside className="hero-signal" aria-label="CivicPath project pathway">
          <p>Project pathway</p>
          <ol>
            <li><span>1</span> Priority</li>
            <li><span>2</span> Readiness</li>
            <li><span>3</span> Funding</li>
            <li><span>4</span> Delivery</li>
          </ol>
        </aside>
      </section>

      <section className="statement route-section">
        <div className="section-marker"><span>01</span><i /></div>
        <div className="statement-main">
          <p className="eyebrow">The regional council reality</p>
          <h2>Important projects do not stall for lack of ambition. They stall when the next step is unclear.</h2>
        </div>
        <div className="statement-note">
          <p>When a small team is coordinating strategy, grants, partnerships and Executive reporting, the work can disappear across spreadsheets, inboxes and disconnected project files.</p>
          <p className="serif-note">CivicPath makes the route forward visible.</p>
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="section-intro route-section">
          <div className="section-marker"><span>02</span><i /></div>
          <div>
            <p className="eyebrow">One operating rhythm</p>
            <h2>From adopted priority to a project that can move.</h2>
          </div>
          <p className="intro-note">CivicPath is a Council project-readiness platform—not another generic task list and not a replacement for your finance, records or procurement systems.</p>
        </div>
        <div className="workflow-grid">
          {workflow.map((step) => (
            <article className={`workflow-step ${step.number === "04" ? "decision-step" : ""}`} key={step.number}>
              <p className="step-number">{step.number}</p>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <span className="step-line" />
            </article>
          ))}
        </div>
      </section>

      <section className="council-section" id="councils">
        <div className="council-image-wrap">
          <img src={readinessImage} alt="Project planning materials arranged on a council strategy desk" />
          <span className="image-caption">A practical view of what needs to happen next.</span>
        </div>
        <div className="council-copy route-section">
          <div className="section-marker"><span>03</span><i /></div>
          <p className="eyebrow">Designed for the work in front of you</p>
          <h2>Built for regional councils, where every capable person wears more than one hat.</h2>
          <div className="check-list">
            <p><b>Economic development</b> teams shaping investment-ready projects and local growth pathways.</p>
            <p><b>Strategy and planning</b> teams connecting adopted priorities to accountable actions.</p>
            <p><b>Infrastructure and grants</b> teams preparing projects for funders, partners and delivery.</p>
            <p><b>Executives and directors</b> who need a decision-ready portfolio view without another manual report.</p>
          </div>
          <a className="text-link strong" href="#proof">Start with a live Council portfolio <span>→</span></a>
        </div>
      </section>

      <section className="modules-section">
        <div className="section-intro route-section">
          <div className="section-marker"><span>04</span><i /></div>
          <div>
            <p className="eyebrow">The CivicPath toolkit</p>
            <h2>Enough structure to move work forward. Not more software for its own sake.</h2>
          </div>
        </div>
        <div className="modules-list">
          {modules.map(([name, body], index) => (
            <article className={`module-row ${name.includes("decisions") ? "decision-module" : ""}`} key={name}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{name}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="connection-section">
        <div className="connection-copy route-section">
          <div className="section-marker"><span>05</span><i /></div>
          <p className="eyebrow">A clear product choice</p>
          <h2>CivicPath stands on its own.</h2>
          <p>CivicPath manages the route from Council priority to a delivery-ready project. If your Council also needs a full grant lifecycle—from opportunity through to acquittal—GrantMaestro can be connected as an optional companion.</p>
          <p className="serif-note">Buy the product that solves the problem you have. Add the other only when it adds value.</p>
        </div>
        <div className="connection-diagram" aria-label="Optional CivicPath and GrantMaestro connection">
          <div className="product-node civic-node"><img src={gateLogo} alt="" /><strong>CivicPath</strong><span>Priorities · projects · readiness</span></div>
          <div className="optional-link"><span>Optional connection</span><i>↔</i></div>
          <div className="product-node grant-node"><strong>GrantMaestro</strong><span>Opportunities · applications · acquittals</span></div>
        </div>
      </section>

      <section className="proof-section" id="proof">
        <div className="route-badge proof-route"><span>05</span><i /></div>
        <div className="proof-photo" style={{ backgroundImage: `url(${workshopImage})` }} aria-hidden="true" />
        <div className="proof-panel">
          <p className="eyebrow light">A low-risk starting point</p>
          <h2>Start with one live portfolio.</h2>
          <p>A CivicPath Council Proof is a focused 60-day engagement that helps your team test the workflow with real projects, real constraints and a practical Executive review.</p>
          <div className="proof-points">
            <span>15 projects</span><span>60 days</span><span>$1,200</span>
          </div>
          <a className="button button-light" href="#pricing">View the Council Proof <span>→</span></a>
          <p className="small-print">The Proof fee is creditable against an annual CivicPath subscription when you proceed.</p>
        </div>
      </section>

      <section className="pricing-section" id="pricing">
        <div className="route-badge pricing-route"><span>06</span><i /></div>
        <div className="section-intro route-section">
          <div className="section-marker"><span>06</span><i /></div>
          <div>
            <p className="eyebrow">Proposed market-entry pricing</p>
            <h2>Simple annual pricing, scaled to the work—not every person who needs to see it.</h2>
          </div>
          <p className="intro-note">All pricing is in AUD, excluding GST. Council Proof and annual subscriptions are designed for a clear, manageable procurement conversation.</p>
        </div>
        <div className="pricing-grid">
          {pricing.map((tier) => (
            <article className={`price-block ${tier.accent}`} key={tier.name}>
              <p className="price-name">{tier.name}</p>
              <p className="price"><span>{tier.price}</span> {tier.term}</p>
              <p className="price-description">{tier.description}</p>
              <ul>{tier.points.map((point) => <li key={point}>{point}</li>)}</ul>
              <a href="#top" className="text-link">Discuss this option <span>→</span></a>
            </article>
          ))}
        </div>
      </section>

      <section className="final-section route-section">
        <div className="route-badge final-route"><span>07</span><i /></div>
        <div className="section-marker"><span>07</span><i /></div>
        <p className="eyebrow">A more dependable route forward</p>
        <h2>Make the next project conversation more useful.</h2>
        <p>See the portfolio, understand the blockers and give your team a shared route toward a fundable, deliverable outcome.</p>
        <a className="button button-primary" href="#proof">Explore a Council Proof <span>→</span></a>
      </section>

      <footer className="site-footer">
        <a className="brand" href="#top"><img src={gateLogo} alt="CivicPath Gate logo placeholder" /><span>CivicPath</span></a>
        <p>Strategic project readiness for regional councils.</p>
        <p className="footer-note">Initial marketing site draft · The Gate is a placeholder brand mark.</p>
      </footer>
    </main>
  );
}
