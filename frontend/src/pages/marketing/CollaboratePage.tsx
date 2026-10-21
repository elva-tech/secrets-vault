import { Link } from 'react-router-dom';
import { MarketingHeader } from '../../components/marketing/MarketingHeader';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

const STEPS = [
  { n: 1, title: 'Talk to ELVA', body: 'Share your use case, team size, and environment structure.' },
  { n: 2, title: 'Workspace setup', body: 'We provision a tenant hostname and initial administrator access.' },
  { n: 3, title: 'Configure your workspace', body: 'Organize applications, environments, roles, and access policies.' },
  { n: 4, title: 'Start securing secrets', body: 'Onboard your team and migrate credentials using supported vault flows.' },
] as const;

/** Presentation-only — no backend contact form in this product. */
export function CollaboratePage() {
  return (
    <div className="mkt-page mkt-page--collab">
      <MarketingHeader />
      <main className="mkt-container mkt-collab-main">
        <div className="mkt-collab-grid">
          <div>
            <h1 className="mkt-headline">Let&apos;s build your secrets workspace</h1>
            <p className="mkt-lead">
              Contact ELVA Tech to discuss a dedicated Secrets Vault workspace for your organization. This page
              does not submit data to the vault API — use the channels below.
            </p>
            <ul className="mkt-contact-list">
              <li>
                <strong>Website</strong>
                <a href="https://elvatech.in" target="_blank" rel="noreferrer">elvatech.in</a>
              </li>
              <li>
                <strong>Email</strong>
                <a href="mailto:support@elvatech.in">support@elvatech.in</a>
              </li>
            </ul>
            <Link className="btn btn-secondary" to="/">Back to home</Link>
          </div>
          <div className="card card--workspace surface-light">
            <h2 className="mkt-section-title mkt-section-title--sm">How it works</h2>
            <ol className="mkt-collab-steps">
              {STEPS.map((s) => (
                <li key={s.n}>
                  <span className="mkt-collab-step-num">{s.n}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <p>{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
