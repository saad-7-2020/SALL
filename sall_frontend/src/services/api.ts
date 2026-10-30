import type { Conversation, Database, SSEEvent } from '../types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ── Conversations ─────────────────────────────────────────────────

export async function getConversations(): Promise<Conversation[]> {
  const r = await fetch(`${BASE}/conversations`)
  if (!r.ok) throw new Error('Failed to load conversations')
  return r.json()
}

export async function createConversation(databases: string[]): Promise<Conversation> {
  const r = await fetch(`${BASE}/conversations`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ title: 'Nouvelle conversation', databases }),
  })
  if (!r.ok) throw new Error('Failed to create conversation')
  return r.json()
}

export async function getConversation(id: string): Promise<Conversation> {
  const r = await fetch(`${BASE}/conversations/${id}`)
  if (!r.ok) throw new Error('Failed to load conversation')
  return r.json()
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(`${BASE}/conversations/${id}`, { method: 'DELETE' })
}

// ── Messages ──────────────────────────────────────────────────────
// db_configs : configs DB complètes depuis l'icône utilisateur (navbar)

export async function sendMessage(
  convId:     string,
  content:    string,
  dbConfigs:  object[] = [],   // ← NOUVEAU : configs DB depuis la navbar
): Promise<{
  sall_msg_id: string
  stream_url:  string
  question:    string
  databases:   string[]
  db_configs:  object[]
}> {
  const r = await fetch(`${BASE}/conversations/${convId}/message`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ content, db_configs: dbConfigs }),
  })
  if (!r.ok) throw new Error('Failed to send message')
  return r.json()
}

// ── SSE Stream ────────────────────────────────────────────────────
// db_configs est encodé en JSON dans les query params

export function streamPipeline(
  msgId:      string,
  question:   string,
  databases:  string[],
  dbConfigs:  object[],        // ← NOUVEAU : configs DB depuis la navbar
  onEvent:    (e: SSEEvent) => void,
  onDone:     () => void,
  onError:    (err: string) => void
): () => void {
  const params = new URLSearchParams({
    question,
    databases:  databases.join(','),
    db_configs: JSON.stringify(dbConfigs),   // ← transmis au backend
  })
  const url = `${BASE}/stream/${msgId}?${params}`
  const es  = new EventSource(url)

  es.onmessage = (ev) => {
    try {
      const data: SSEEvent = JSON.parse(ev.data)
      onEvent(data)
      if (data.type === 'done' || data.type === 'error') {
        es.close()
        if (data.type === 'done') onDone()
        else onError(data.message ?? 'Pipeline error')
      }
    } catch { /* ignore malformed */ }
  }

  es.onerror = () => {
    es.close()
    onError('Connection lost')
  }

  return () => es.close()
}

// ── Databases ─────────────────────────────────────────────────────

export async function getDatabases(): Promise<Database[]> {
  const r = await fetch(`${BASE}/databases`)
  if (!r.ok) throw new Error('Failed to load databases')
  return r.json()
}