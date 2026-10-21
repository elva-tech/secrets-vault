import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationsPage } from './ApplicationsPage';
import { apiFetch } from '../api/client';

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    me: { permissions: ['application.create', 'application.view'] },
  }),
}));

describe('ApplicationsPage', () => {
  afterEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('renders application cards from API data', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path.startsWith('/api/applications?') || path === '/api/applications') {
        return {
          applications: [
            {
              id: 'app-1',
              name: 'ApnaCart API',
              slug: 'apnacart-api',
              description: 'Payments service',
              status: 'ACTIVE',
            },
          ],
        };
      }
      if (path.includes('/environments')) {
        return { environments: [{ id: 'e1' }, { id: 'e2' }] };
      }
      throw new Error(`unexpected ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('ApnaCart API')).toBeTruthy();
    });
    expect(screen.getByText('2', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('ACTIVE')).toBeTruthy();
  });
});
