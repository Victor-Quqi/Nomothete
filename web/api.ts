import type { Bootstrap, Candidate, Session, SessionPayload, SessionSummary, Verdict } from './types.ts'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...(init?.headers ?? {}) } : init?.headers,
  })
  const text = await res.text()
  let payload: any = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!res.ok) throw new Error(payload?.error ?? `请求失败（${res.status}）`)
  return payload as T
}

export const api = {
  bootstrap: () => call<Bootstrap>('/bootstrap'),

  sessions: () => call<{ sessions: SessionSummary[] }>('/sessions'),

  createSession: (body: {
    brief: string
    title?: string
    seeds?: { text: string; verdict: Verdict }[]
    priors?: string[]
    threshold?: number
    autostart?: boolean
  }) =>
    call<{ session: Session; started: { generation: number; strategies: string[] } | null; error?: string }>(
      '/sessions',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  session: (id: string) => call<SessionPayload>(`/sessions/${id}`),

  patchSession: (id: string, patch: Partial<Pick<Session, 'title' | 'brief' | 'priors' | 'threshold'>>) =>
    call<{ session: Session }>(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteSession: (id: string) => call<{ ok: true }>(`/sessions/${id}`, { method: 'DELETE' }),

  generate: (id: string, body: { width?: number; strategyIds?: string[] } = {}) =>
    call<{ generation: number; strategies: string[] }>(`/sessions/${id}/generate`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  cancel: (id: string) => call<{ ok: true }>(`/sessions/${id}/cancel`, { method: 'POST', body: '{}' }),

  verdict: (candidateId: string, verdict: Verdict) =>
    call<{ candidate: Candidate }>(`/candidates/${candidateId}/verdict`, {
      method: 'POST',
      body: JSON.stringify({ verdict }),
    }),

  note: (candidateId: string, note: string) =>
    call<{ candidate: Candidate }>(`/candidates/${candidateId}/note`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  recheck: (candidateId: string) =>
    call<{ ok: true }>(`/candidates/${candidateId}/recheck`, { method: 'POST', body: '{}' }),

  exportUrl: (id: string, format: 'json' | 'md') => `/api/sessions/${id}/export?format=${format}`,
}
