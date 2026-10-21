import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ElvaLogo } from '../brand/ElvaLogo';

const NAV = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#workspaces', label: 'Workspaces' },
  { href: '#security', label: 'Security' },
] as const;

export function MarketingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="mkt-header">
      <div className="mkt-header-inner">
        <ElvaLogo variant="light" to="/" />
        <button
          type="button"
          className="mkt-nav-toggle"
          aria-expanded={open}
          aria-controls="mkt-nav"
          onClick={() => setOpen((v) => !v)}
        >
          Menu
        </button>
        <nav id="mkt-nav" className={`mkt-nav ${open ? 'mkt-nav--open' : ''}`}>
          {NAV.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </a>
          ))}
          <Link className="btn btn-primary btn-sm" to="/login" onClick={() => setOpen(false)}>
            Admin Login
          </Link>
        </nav>
      </div>
    </header>
  );
}
