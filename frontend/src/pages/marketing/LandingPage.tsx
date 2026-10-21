import { Link } from 'react-router-dom';
import { MarketingHeader } from '../../components/marketing/MarketingHeader';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { useVaultBaseDomain } from '../../hooks/useVaultBaseDomain';
import { exampleTenantHostname } from '../../lib/hostname';

const STEPS = [
  {
    n: 1,
    title: 'Create Your Workspace',
    body: 'Each organization receives its own tenant hostname and isolated workspace for users, applications, and secrets.',
  },
  {
    n: 2,
    title: 'Organize Your Applications',
    body: 'Group resources by application and manage environments such as DEV, TEST, STAGE, and PROD.',
  },
  {
    n: 3,
    title: 'Secure Your Secrets',
    body: 'Store credentials and sensitive files using encrypted vault storage with masked values by default.',
  },
  {
    n: 4,
    title: 'Control and Audit Access',
    body: 'Apply roles and permissions, use access requests and temporary grants where supported, and review audit events.',
  },
] as const;

const FEATURES = [
  ['Application & environment organization', 'Structure secrets around real application boundaries.'],
  ['Encrypted secret storage', 'Sensitive values are stored encrypted; the UI never shows raw secrets without authorization.'],
  ['Environment-specific secrets', 'Keep DEV, TEST, STAGE, and PROD configuration separate per application.'],
  ['Controlled reveal & copy', 'Reveal and copy actions respect permissions and supported approval flows.'],
  ['Role-based permissions', 'Assign built-in and custom roles with granular tenant permissions.'],
  ['Access requests & grants', 'Request access, approve with OTP where required, and use time-bound grants.'],
  ['Personal vault', 'Owner-only space for individual credentials and files.'],
  ['Versioning & rotation', 'Track secret versions and run supported rotation workflows.'],
  ['Encrypted file handling', 'Upload and download sensitive files within vault policies.'],
  ['Audit history', 'Review sensitive operations recorded by the audit service.'],
  ['Multi-tenant isolation', 'Hostname-bound tenants with scoped membership and authorization.'],
  ['Platform & tenant administration', 'ELVA platform operators manage tenants; tenant admins manage their workspace.'],
] as const;

export function LandingPage() {
  const { baseDomain } = useVaultBaseDomain();
  const workspaceExample = exampleTenantHostname(baseDomain);

  return (
    <div className="mkt-page">
      <MarketingHeader />
      <section className="mkt-hero">
        <div className="mkt-hero-grid mkt-container">
          <div className="mkt-hero-copy">
            <p className="mkt-eyebrow">ELVA SECURE SECRETS MANAGEMENT</p>
            <h1 className="mkt-headline">Your secrets. Your environments. Your control.</h1>
            <p className="mkt-lead">
              Manage application credentials, environment-specific configuration, and sensitive files in a
              secure workspace built around controlled access, encrypted storage, and tenant isolation.
            </p>
            <div className="mkt-hero-cta">
              <a className="btn btn-primary" href="#how-it-works">Explore the Vault</a>
              <a className="btn btn-secondary" href="#how-it-works">How It Works</a>
            </div>
          </div>
          <div className="mkt-preview" aria-hidden="true">
            <p className="mkt-preview-label">WORKSPACE PREVIEW</p>
            <p className="mkt-preview-host">payments-api · PROD</p>
            <ul className="mkt-preview-list">
              <li><span className="mkt-mask">••••••••••••</span> DATABASE_URL <span className="mkt-badge">encrypted</span></li>
              <li><span className="mkt-mask">••••••••</span> API_KEY <span className="mkt-badge">masked</span></li>
              <li>Access policy · approval required</li>
              <li>Audit · reveal logged</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mkt-section mkt-section--divider">
        <div className="mkt-container">
          <h2 className="mkt-section-title">How it works</h2>
          <p className="mkt-section-lead">From workspace provisioning to audited access in four steps.</p>
          <div className="mkt-steps">
            {STEPS.map((s) => (
              <article key={s.n} className="mkt-step">
                <span className="mkt-step-num">Step {s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="mkt-section">
        <div className="mkt-container">
          <h2 className="mkt-section-title">Built for secure operations</h2>
          <p className="mkt-section-lead">Capabilities available in Secrets Vault by ELVA today.</p>
          <div className="mkt-feature-grid">
            {FEATURES.map(([title, desc]) => (
              <div key={title} className="mkt-feature">
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workspaces" className="mkt-section mkt-section--divider">
        <div className="mkt-container mkt-split">
          <div>
            <h2 className="mkt-section-title">Your workspace. Your environment. Your access.</h2>
            <p className="mkt-section-lead">
              Each organization operates on a dedicated tenant hostname. Data, users, and roles stay scoped to
              that workspace.
            </p>
            <p className="mkt-host-example mono">{workspaceExample}</p>
            <ul className="mkt-checklist">
              <li>Dedicated workspace hostname</li>
              <li>Independent users and roles</li>
              <li>Application and environment organization</li>
              <li>Tenant-scoped authorization</li>
              <li>Controlled access to sensitive resources</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="security" className="mkt-section mkt-section--divider">
        <div className="mkt-container">
          <h2 className="mkt-section-title">Security model</h2>
          <p className="mkt-section-lead">
            How Secrets Vault protects sensitive data across tenants, applications, and environments.
          </p>
          <ul className="mkt-security-list">
            <li>Encrypted storage for secret values and supported file payloads.</li>
            <li>Masked secrets in the UI until an authorized reveal or copy action succeeds.</li>
            <li>Permission checks on sensitive operations; server-side authorization is always enforced.</li>
            <li>Hostname-based tenant isolation — tenant context is not taken from client-supplied tenant IDs.</li>
            <li>Personal vault items are visible only to their owner.</li>
            <li>Access policies, requests, OTP verification, and temporary grants where configured.</li>
            <li>Audit events for supported sensitive actions.</li>
          </ul>
        </div>
      </section>

      <section className="mkt-cta">
        <div className="mkt-container mkt-cta-inner">
          <h2 className="mkt-section-title">Ready to secure your organization&apos;s secrets?</h2>
          <p className="mkt-section-lead">
            Discover how Secrets Vault by ELVA can help your team organize sensitive configuration and manage
            access across environments.
          </p>
          <Link className="btn btn-primary" to="/collaborate">Collaborate with ELVA</Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
