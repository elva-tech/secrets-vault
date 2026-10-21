export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mkt-footer">
      <div className="mkt-footer-inner">
        <div>
          <p className="mkt-footer-brand">Secrets Vault by ELVA</p>
          <p className="mkt-footer-muted">
            © {year} ELVA. All rights reserved.
            <br />
            An ELVA Tech product ·{' '}
            <a href="https://elvatech.in" target="_blank" rel="noreferrer">
              elvatech.in
            </a>
          </p>
        </div>
        <div className="mkt-footer-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#workspaces">Workspaces</a>
          <a href="#security">Security</a>
          <a href="/collaborate">Collaborate with ELVA</a>
        </div>
      </div>
    </footer>
  );
}
