import { Link } from 'react-router-dom';
import { ElvaLogo } from '../../components/brand/ElvaLogo';
import { useVaultBaseDomain } from '../../hooks/useVaultBaseDomain';
import { tenantSlugFromHostname } from '../../lib/hostname';
import { resolveTenantWelcomeBranding } from '../../lib/tenantDisplay';
import '../../tenant-welcome.css';

const STEPS = [
  {
    n: 1,
    title: 'Sign in securely',
    body: 'Access your organization’s workspace using your existing tenant account and hostname.',
  },
  {
    n: 2,
    title: 'Organize applications',
    body: 'Group applications and manage DEV, TEST, STAGE, and PROD environments.',
  },
  {
    n: 3,
    title: 'Secure your secrets',
    body: 'Store credentials and sensitive values in encrypted vault storage.',
  },
  {
    n: 4,
    title: 'Control access',
    body: 'Use roles, policies, access requests, and audit history where configured.',
  },
] as const;

const CAPABILITIES = [
  ['Application & environment organization', 'Structure secrets around application boundaries.'],
  ['Encrypted secret storage', 'Sensitive values are stored encrypted at rest.'],
  ['Controlled reveal & copy', 'Reveal and copy respect permissions and approvals.'],
  ['Role-based permissions', 'Assign roles with granular tenant permissions.'],
  ['Access requests & grants', 'Request access and use time-bound grants when enabled.'],
  ['Version history & rotation', 'Track versions and supported rotation workflows.'],
  ['Encrypted file storage', 'Upload and download files within vault policies.'],
  ['Personal Vault', 'Owner-only space for individual credentials.'],
  ['Audit history', 'Review sensitive operations recorded by the audit service.'],
] as const;

const SECURITY = [
  'Encrypted storage for secret values and supported file payloads.',
  'Masked values in the UI until an authorized reveal or copy succeeds.',
  'Server-side authorization for sensitive operations.',
  'Access policies, requests, and OTP verification where configured.',
  'Tenant-scoped access tied to hostname and membership.',
  'Audit events for supported sensitive actions.',
] as const;

export function TenantWelcomePage() {
  const { baseDomain, loading } = useVaultBaseDomain();
  const slug = tenantSlugFromHostname(window.location.hostname, baseDomain) ?? 'workspace';
  const branding = resolveTenantWelcomeBranding(slug, baseDomain);

  if (loading) {
    return (
      <div className="tw-page" style={{ padding: '3rem', textAlign: 'center' }}>
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="tw-page">
      <header className="tw-header">
        <div className="tw-header-inner">
          <div className="tw-header-brand">
            <img
              src={branding.logoSrc}
              alt=""
              className="tw-tenant-logo"
              width={48}
              height={48}
            />
            <div className="tw-header-copy">
              <h1>{branding.displayName}</h1>
              <p>{branding.tagline}</p>
            </div>
          </div>
          <Link className="btn btn-primary" to="/login">Sign in</Link>
        </div>
      </header>

      <section className="tw-hero">
        <div className="tw-container tw-hero-grid">
          <div>
            <p className="tw-eyebrow">{branding.displayName.toUpperCase()} · SECRETS VAULT</p>
            <h2 className="tw-headline">Your secrets. Your applications. Your control.</h2>
            <p className="tw-lead">{branding.welcomeMessage}</p>
            <div className="tw-hero-cta">
              <Link className="btn btn-primary" to="/login">Sign in to your workspace</Link>
              <a className="btn btn-secondary" href="#tw-how-it-works">How it works</a>
            </div>
          </div>
          <div className="tw-preview" aria-hidden="true">
            <p className="tw-preview-label">WORKSPACE PREVIEW</p>
            <p>{branding.displayName} applications</p>
            <div className="tw-env-row">
              {['DEV', 'TEST', 'STAGE', 'PROD'].map((env) => (
                <span key={env} className="tw-env-chip">{env}</span>
              ))}
            </div>
            <ul className="mkt-preview-list">
              <li>Application-scoped secrets</li>
              <li>Role-based access controls</li>
              <li>Approval workflows where configured</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="tw-how-it-works" className="tw-section">
        <div className="tw-container">
          <h2 className="tw-section-title">How it works</h2>
          <p className="tw-section-lead">A simple path from sign-in to audited access.</p>
          <div className="tw-steps">
            {STEPS.map((s) => (
              <article key={s.n}>
                <span className="tw-step-num">Step {s.n}</span>
                <h3>{s.title}</h3>
                <p className="muted">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="tw-capabilities" className="tw-section">
        <div className="tw-container">
          <h2 className="tw-section-title">Workspace capabilities</h2>
          <p className="tw-section-lead">
            Features available in Secrets Vault by ELVA. Access depends on your assigned role.
          </p>
          <div className="tw-feature-grid">
            {CAPABILITIES.map(([title, desc]) => (
              <div key={title} className="tw-feature">
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="tw-workspace" className="tw-section">
        <div className="tw-container">
          <h2 className="tw-section-title">Your dedicated workspace</h2>
          <p className="tw-section-lead">
            Each organization operates on its own hostname. Users, roles, and applications stay scoped
            to this tenant.
          </p>
          <p className="tw-host-example">{branding.workspaceHostname}</p>
          <ul className="mkt-checklist">
            <li>Dedicated workspace hostname</li>
            <li>Independent users and roles</li>
            <li>Application and environment organization</li>
            <li>Tenant-scoped authorization</li>
            <li>No cross-tenant data exposure from the browser</li>
          </ul>
        </div>
      </section>

      <section id="tw-security" className="tw-section">
        <div className="tw-container">
          <h2 className="tw-section-title">Security</h2>
          <ul className="tw-security-list">
            {SECURITY.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="tw-footer">
        <div className="tw-container">
          <ElvaLogo variant="light" subtitle="Tenant workspace portal" to="/" />
          <p style={{ marginTop: '0.75rem' }}>
            © {new Date().getFullYear()} Secrets Vault by ELVA · An ELVA Tech product ·{' '}
            <a href="https://elvatech.in" target="_blank" rel="noreferrer">elvatech.in</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
