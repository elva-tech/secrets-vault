import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';

const FALLBACK = 'vault.localhost';

export function useVaultBaseDomain(): { baseDomain: string; loading: boolean } {
  const [baseDomain, setBaseDomain] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<{ baseDomain: string }>('/api/config/public')
      .then((r) => setBaseDomain(r.baseDomain || FALLBACK))
      .catch(() => setBaseDomain(FALLBACK))
      .finally(() => setLoading(false));
  }, []);

  return { baseDomain, loading };
}
