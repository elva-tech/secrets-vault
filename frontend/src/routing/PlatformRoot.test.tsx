import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PlatformRoot } from './PlatformRoot';

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../hooks/useVaultBaseDomain', () => ({
  useVaultBaseDomain: vi.fn(),
}));

vi.mock('../pages/marketing/LandingPage', () => ({
  LandingPage: () => <div data-testid="landing-page">Landing</div>,
}));

vi.mock('../pages/tenant/TenantWelcomePage', () => ({
  TenantWelcomePage: () => <div data-testid="tenant-welcome">Tenant welcome</div>,
}));

vi.mock('../pages/UnavailableWorkspacePage', () => ({
  UnavailableWorkspacePage: () => <div data-testid="unavailable">Unavailable</div>,
}));

import { useAuth } from '../auth/AuthContext';
import { useVaultBaseDomain } from '../hooks/useVaultBaseDomain';

describe('PlatformRoot routing', () => {
  beforeEach(() => {
    vi.mocked(useVaultBaseDomain).mockReturnValue({
      baseDomain: 'vault.localhost',
      loading: false,
    });
    vi.stubGlobal('location', { ...window.location, hostname: 'vault.localhost' });
  });

  it('shows marketing on platform host when logged out', () => {
    vi.mocked(useAuth).mockReturnValue({
      me: null,
      loading: false,
      refresh: async () => null,
      logout: async () => {},
    });
    render(
      <MemoryRouter>
        <PlatformRoot />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('landing-page')).toBeTruthy();
  });

  it('shows tenant welcome on tenant host when logged out', () => {
    vi.stubGlobal('location', { ...window.location, hostname: 'elva.vault.localhost' });
    vi.mocked(useAuth).mockReturnValue({
      me: null,
      loading: false,
      refresh: async () => null,
      logout: async () => {},
    });
    render(
      <MemoryRouter>
        <PlatformRoot />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('tenant-welcome')).toBeTruthy();
  });
});
