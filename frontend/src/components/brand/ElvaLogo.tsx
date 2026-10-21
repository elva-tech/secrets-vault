import { Link } from 'react-router-dom';

/** Official ELVA brand tile — `frontend/public/brand/ELVA_LOGO.png` */
const ELVA_LOGO_SRC = '/brand/ELVA_LOGO.png';

type ElvaLogoProps = {
  variant?: 'light' | 'dark';
  subtitle?: string;
  to?: string;
};

export function ElvaLogo({ variant = 'light', subtitle, to = '/' }: ElvaLogoProps) {
  const markClass = variant === 'light' ? 'elva-logo elva-logo--light' : 'elva-logo elva-logo--dark';
  const content = (
    <>
      <img
        src={ELVA_LOGO_SRC}
        alt="ELVA"
        className="elva-logo-img"
        width={44}
        height={44}
        decoding="async"
      />
      <span className="elva-logo-text">
        <span className="elva-logo-title">Secrets Vault</span>
        <span className="elva-logo-by">BY ELVA</span>
        {subtitle && <span className="elva-logo-sub">{subtitle}</span>}
      </span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={markClass}>
        {content}
      </Link>
    );
  }

  return <div className={markClass}>{content}</div>;
}
