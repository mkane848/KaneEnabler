import { AccountMenu } from './components/AccountMenu';

interface Tool {
  name: string;
  tagline: string;
  description: string;
  href: string;
}

/**
 * href is a same-origin subpath, not a cross-origin URL — this page is
 * built and served as part of the combined platform static site
 * (scripts/build-platform.mjs at the repo root), with each tool's own
 * build copied in under its subpath. Each tool is still its own
 * independently-versioned app in source (see docs/handoff.md's Phase 0/
 * consolidation notes) — only the deploy is merged.
 */
const TOOLS: Tool[] = [
  {
    name: "Commander? I Hardly Know 'Er",
    tagline: 'Commander recommender',
    description:
      'Paste or upload a decklist and get ranked Commander suggestions — including Partner and Background pairs — with cited synergies, ban-list legality, and an estimated Bracket.',
    href: '/recommender/',
  },
  {
    name: 'Time Counters',
    tagline: 'Doctor Who deck companion',
    description:
      "A turn tracker built for one Jeskai deck's Suspend, Vanishing, Fading, and Saga cards — plus The Tenth Doctor and Rose Tyler's own time-counter abilities.",
    href: '/time-counters/',
  },
];

export default function App() {
  return (
    <div className="page">
      <header className="page-header">
        <span className="brand">KaneEnabler</span>
        <AccountMenu />
      </header>

      <main className="page-main">
        <h1 className="page-title">Magic: The Gathering tools</h1>
        <p className="page-subtitle">Pick a tool to get started. One account works across both.</p>

        <div className="tool-grid">
          {TOOLS.map((tool) => (
            <a key={tool.href} className="tool-card" href={tool.href}>
              <span className="tool-tagline">{tool.tagline}</span>
              <h2 className="tool-name">{tool.name}</h2>
              <p className="tool-description">{tool.description}</p>
              <span className="tool-cta">Open →</span>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
