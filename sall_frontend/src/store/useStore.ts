import { create } from 'zustand'
import type { Conversation, Message, PipelineStep, SqlEvent, DbConnection } from '../types'
import * as api from '../services/api'

interface AppState {
  conversations:      Conversation[]
  activeConvId:       string | null
  activeConv:         Conversation | null
  loadingConvs:       boolean
  dbConnections:      DbConnection[]
  streaming:          boolean
  streamingMsgId:     string | null

  loadConversations:  () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  newConversation:    () => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  sendMessage:        (content: string, convId?: string) => Promise<void>
  addDbConnection:    (db: Omit<DbConnection, 'id' | 'status'>) => void
  removeDbConnection: (id: string) => void
  updateDbStatus:     (id: string, status: DbConnection['status']) => void

  _appendToken:   (msgId: string, token: string) => void
  _updateStep:    (msgId: string, step: PipelineStep) => void
  _addSqlEvent:   (msgId: string, ev: SqlEvent) => void
  _setStreamDone: (msgId: string) => void
}

function hydrateMessage(raw: any): Message {
  return {
    ...raw,
    pipeline_steps: (() => {
      if (Array.isArray(raw.pipeline_steps)) return raw.pipeline_steps
      try { return JSON.parse(raw.pipeline_steps ?? '[]') } catch { return [] }
    })(),
    sql_events: (() => {
      if (Array.isArray(raw.sql_events)) return raw.sql_events
      try { return JSON.parse(raw.sql_events ?? '[]') } catch { return [] }
    })(),
    figures: (() => {
      if (Array.isArray(raw.figures)) return raw.figures
      try { return JSON.parse(raw.figures ?? '[]') } catch { return [] }
    })(),
    streaming: false,
  }
}

export const useStore = create<AppState>((set, get) => ({
  conversations:  [],
  activeConvId:   null,
  activeConv:     null,
  loadingConvs:   false,
  dbConnections:  [],
  streaming:      false,
  streamingMsgId: null,

  // ── DB Connections ─────────────────────────────────────────────
  addDbConnection: (db) => {
    const newConn: DbConnection = { ...db, id: crypto.randomUUID(), status: 'pending' }
    set(s => ({ dbConnections: [...s.dbConnections, newConn] }))
  },
  removeDbConnection: (id) =>
    set(s => ({ dbConnections: s.dbConnections.filter(d => d.id !== id) })),
  updateDbStatus: (id, status) =>
    set(s => ({
      dbConnections: s.dbConnections.map(d => d.id === id ? { ...d, status } : d),
    })),

  // ── Conversations ─────────────────────────────────────────────
  loadConversations: async () => {
    set({ loadingConvs: true })
    try {
      const convs = await api.getConversations()
      set({ conversations: convs, loadingConvs: false })
    } catch { set({ loadingConvs: false }) }
  },

  selectConversation: async (id) => {
    try {
      const conv = await api.getConversation(id)
      conv.messages = (conv.messages ?? []).map(hydrateMessage)
      set({ activeConvId: id, activeConv: conv })
    } catch (err) { console.error('selectConversation failed:', err) }
  },

  newConversation: async () => {
    const { dbConnections } = get()
    const dbIds = dbConnections.filter(d => d.status === 'connected').map(d => d.id)
    const conv  = await api.createConversation(dbIds)
    set(s => ({
      conversations: [conv, ...s.conversations],
      activeConvId:  conv.id,
      activeConv:    { ...conv, messages: [] },
    }))
    return conv.id
  },

  deleteConversation: async (id) => {
    await api.deleteConversation(id)
    set(s => ({
      conversations: s.conversations.filter(c => c.id !== id),
      activeConvId:  s.activeConvId === id ? null : s.activeConvId,
      activeConv:    s.activeConvId === id ? null : s.activeConv,
    }))
  },

  // ── Send message ───────────────────────────────────────────────
  sendMessage: async (content, convId) => {
    const state = get()
    let targetId = convId ?? state.activeConvId
    if (!targetId) targetId = await get().newConversation()

    const { dbConnections } = get()

    // ── Configs DB complètes pour le pipeline ──────────────────
    // On envoie TOUTES les connexions — pipeline filtre par status
    const connectedConfigs = dbConnections
      .filter(d => d.status === 'connected')
      .map(d => ({
        id:       d.id,
        name:     d.name,
        host:     d.host,
        port:     d.port ?? '5432',
        user:     d.user,
        password: d.password,
      }))

    const connectedIds = connectedConfigs.map(d => d.id)

    const userMsg: Message = {
      id: 'tmp-user-' + Date.now(), conv_id: targetId,
      role: 'user', content,
      pipeline_steps: [], sql_events: [], figures: [],
      created_at: new Date().toISOString(),
    }

    const sallMsg: Message = {
      id: 'tmp-sall-' + Date.now(), conv_id: targetId,
      role: 'assistant', content: '',
      pipeline_steps: [
        { step: 'brief',    status: 'pending', label: 'SALL-Brief'    },
        { step: 'rag',      status: 'pending', label: 'RAG'           },
        { step: 'logic',    status: 'pending', label: 'SALL-Logic'    },
        { step: 'analyzer', status: 'pending', label: 'SALL-Analyzer' },
        { step: 'expert',   status: 'pending', label: 'SALL-Expert'   },
      ],
      sql_events: [], figures: [],
      created_at: new Date().toISOString(),
      streaming:  true,
    }

    set(s => ({
      activeConv: s.activeConv ? {
        ...s.activeConv,
        messages: [...(s.activeConv.messages ?? []), userMsg, sallMsg],
      } : {
        id: targetId!, title: content.slice(0, 50),
        databases: [], created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [userMsg, sallMsg],
      },
      streaming:      true,
      streamingMsgId: sallMsg.id,
    }))

    try {
      // ── Envoyer db_configs au backend ─────────────────────────
      const res    = await api.sendMessage(targetId, content, connectedConfigs)
      const realId = res.sall_msg_id

      set(s => ({
        streamingMsgId: realId,
        activeConv: s.activeConv ? {
          ...s.activeConv,
          messages: s.activeConv.messages.map(m =>
            m.id === sallMsg.id ? { ...m, id: realId } : m
          ),
        } : null,
      }))

      // ── Lancer SSE avec db_configs ────────────────────────────
      api.streamPipeline(
        realId, content, connectedIds, connectedConfigs,
        (ev) => {
          const { _appendToken, _updateStep, _addSqlEvent } = get()
          if (ev.type === 'token' && ev.content)
            _appendToken(realId, ev.content)
          else if (ev.type === 'step' && ev.step && ev.status)
            _updateStep(realId, {
              step: ev.step, status: ev.status as any,
              label: ev.label ?? ev.step, detail: ev.detail,
              informations: ev.informations,
            })
          else if (ev.type === 'sql' && ev.index !== undefined)
            _addSqlEvent(realId, {
              index: ev.index, description: ev.description ?? '',
              query: ev.query ?? '', rows: ev.rows ?? 0,
              columns: ev.columns ?? [],
            })
          else if (ev.type === 'figures' && Array.isArray(ev.figures))
            set(s => ({
              activeConv: s.activeConv ? {
                ...s.activeConv,
                messages: s.activeConv.messages.map(m =>
                  m.id === realId ? { ...m, figures: ev.figures! } : m
                ),
              } : null,
            }))
        },
        () => get()._setStreamDone(realId),
        (err) => { console.error(err); get()._setStreamDone(realId) }
      )

    } catch (err) {
      console.error('sendMessage error:', err)
      set({ streaming: false, streamingMsgId: null })
    }
  },

  // ── Internal helpers ───────────────────────────────────────────
  _appendToken: (msgId, token) =>
    set(s => ({
      activeConv: s.activeConv ? {
        ...s.activeConv,
        messages: s.activeConv.messages.map(m =>
          m.id === msgId ? { ...m, content: m.content + token } : m
        ),
      } : null,
    })),

  _updateStep: (msgId, step) =>
    set(s => ({
      activeConv: s.activeConv ? {
        ...s.activeConv,
        messages: s.activeConv.messages.map(m => {
          if (m.id !== msgId) return m
          return {
            ...m,
            pipeline_steps: m.pipeline_steps.map(ps =>
              ps.step === step.step ? { ...ps, ...step } : ps
            ),
          }
        }),
      } : null,
    })),

  _addSqlEvent: (msgId, ev) =>
    set(s => ({
      activeConv: s.activeConv ? {
        ...s.activeConv,
        messages: s.activeConv.messages.map(m =>
          m.id === msgId
            ? { ...m, sql_events: [...(m.sql_events ?? []), ev] }
            : m
        ),
      } : null,
    })),

  _setStreamDone: (msgId) =>
    set(s => ({
      streaming: false, streamingMsgId: null,
      activeConv: s.activeConv ? {
        ...s.activeConv,
        messages: s.activeConv.messages.map(m =>
          m.id === msgId ? { ...m, streaming: false } : m
        ),
      } : null,
    })),
}))