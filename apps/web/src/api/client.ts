export type ApiErrorBody = {
  error?: { code?: string; message?: string };
};

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
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
