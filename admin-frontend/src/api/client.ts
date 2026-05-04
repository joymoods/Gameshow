export const API = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}`;

const TOKEN = import.meta.env.VITE_ADMIN_TOKEN as string | undefined;

/** Drop-in replacement for fetch() that attaches the admin Bearer token. */
export function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers);
  if (TOKEN) headers.set('Authorization', `Bearer ${TOKEN}`);
  return fetch(url, { ...options, headers });
}
