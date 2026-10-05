export type ApiErrorBody = {
  error?: { code?: string; message?: string };
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/** Resolve API path (empty base = same-origin `/api/...` for dev proxy or Vercel rewrite). */
export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

/** Headers for API calls — forwards vault hostname when API is on another origin (Render). */
export function apiRequestHeaders(extra?: HeadersInit, omitContentType = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((v, k) => {
        headers[k] = v;
      });
    } else if (Array.isArray(extra)) {
      for (const [k, v] of extra) headers[k] = v;
    } else {
      Object.assign(headers, extra);
    }
  }
  if (!omitContentType && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (typeof window !== 'undefined') {
    headers['X-Vault-Host'] = window.location.hostname;
  }
  return headers;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(apiUrl(path), {
    ...options,
    credentials: 'include',
    headers: apiRequestHeaders(
      options.headers as HeadersInit | undefined,
      isFormData,
    ),
  });

  if (!res.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* ignore */
    }
    const message = body.error?.message ?? res.statusText;
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = body.error?.code;
    throw err;
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
