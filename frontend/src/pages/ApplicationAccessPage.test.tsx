import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApplicationAccessPage } from './ApplicationAccessPage';

const apiFetch = vi.fn();

vi.mock('../api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

vi.mock('../notifications/ToastContext', () => ({
  useToast: () => ({ push: vi.fn() }),
}));

describe('ApplicationAccessPage', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/access-requests/mine') {
        return {
          requests: [
            {
              id: 'req-1',
              status: 'PENDING',
              reason: 'Need prod access',
              requesterId: 'u1',
              ownerId: 'u2',
              applicationId: 'app-1',
              environmentId: 'env-1',
              resourceIds: ['sec-1'],
              resourceType: 'SECRET',
              permissions: ['secret.reveal'],
              createdAt: new Date().toISOString(),
            },
          ],
        };
      }
      if (path === '/api/access-requests/inbox') {
        return { requests: [] };
      }
      if (path === '/api/access-grants/mine') {
        return { grants: [] };
      }
      throw new Error(`unexpected ${path}`);
    });
  });

  it('shows pending request without OTP controls', async () => {
    render(
      <MemoryRouter initialEntries={['/access-requests']}>
        <Routes>
          <Route path="/access-requests" element={<ApplicationAccessPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Need prod access/)).toBeTruthy();
    });
    expect(screen.queryByText(/Verify OTP/i)).toBeNull();
    expect(screen.queryByLabelText(/OTP/i)).toBeNull();
    expect(screen.getByText(/Waiting for an approver/i)).toBeTruthy();
  });
});
