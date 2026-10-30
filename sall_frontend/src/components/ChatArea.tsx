import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import PipelineBlock from './PipelineBlock'
import FiguresBlock  from './FiguresBlock'

function renderMarkdown(text: string) {
  return text
    .replace(/^## (.+)$/gm, '<h3 style="color:#1E2D41;font-size:14px;margin:14px 0 6px;font-weight:700">$1</h3>')
    .replace(/^### (.+)$/gm, '<h4 style="color:#2E4A6A;font-size:13px;margin:10px 0 4px;font-weight:600">$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li style="margin:3px 0;color:#374151">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="padding-left:18px;margin:6px 0">$&</ul>')
    .replace(/\n/g, '<br/>')
}

const SUGGESTIONS = [
  'Rapport RH complet',
  'Projets en retard',
  'Analyse des missions',
  'Statistiques salariales',
]

export default function ChatArea() {
  const {
    activeConv, activeConvId,
    streaming, sendMessage,
  } = useStore()

  const [input,       setInput]       = useState('')
  const bottomRef                      = useRef<HTMLDivElement>(null)
  const textareaRef                    = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConv?.messages?.length, activeConv?.messages?.at(-1)?.content])

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
  }

  // ── BUG FIX : handleSend ne dépend plus de activeConvId ──
  // sendMessage crée la conversation lui-même si besoin
  const handleSend = async () => {
    const q = input.trim()
    if (!q || streaming) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await sendMessage(q)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const messages = activeConv?.messages ?? []

  // ── Écran d'accueil ────────────────────────────────────────────
  if (messages.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: '#F0F4F8', fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '16px', padding: '40px',
        }}>
          <div style={{ fontSize: '36px', fontWeight: 700, color: '#1E2D41' }}>SALL</div>
          <div style={{ fontSize: '15px', color: '#6B7280', textAlign: 'center', maxWidth: '380px' }}>
            Posez une question sur vos données en langage naturel
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap',
                        justifyContent: 'center', marginTop: '8px' }}>
            {SUGGESTIONS.map(s => (
              <button key={s}
                onClick={() => { setInput(s); textareaRef.current?.focus() }}
                style={{
                  padding: '8px 16px', background: '#DCEAF5',
                  border: '1px solid #B4C8E1', borderRadius: '20px',
                  color: '#2E4A6A', fontSize: '13px', cursor: 'pointer',
                }}
              >{s}</button>
            ))}
          </div>
        </div>
        <InputBar
          input={input} streaming={streaming}
          textareaRef={textareaRef}
          handleInput={handleInput}
          handleKey={handleKey}
          handleSend={handleSend}
        />
      </div>
    )
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: '#F0F4F8', fontFamily: "'Inter', sans-serif", overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 24px', background: '#fff',
        borderBottom: '1px solid #E2EAF2',
        display: 'flex', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#1E2D41' }}>
            {activeConv?.title ?? 'Conversation'}
          </div>
          <div style={{ fontSize: '12px', color: '#9CAAB8', marginTop: '2px' }}>
            {activeConv?.databases?.join(' · ') ?? ''}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '20px 10%',
        display: 'flex', flexDirection: 'column', gap: '16px',
      }}>
        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            alignItems: 'flex-start', gap: '10px',
          }}>
            {msg.role === 'assistant' && (
              <div style={{
                width: '34px', height: '34px', borderRadius: '50%',
                background: '#4A78AF', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: '13px', fontWeight: 700,
                flexShrink: 0, marginTop: '2px',
              }}>S</div>
            )}

            <div style={{
              maxWidth:     '72%',
              background:   msg.role === 'user' ? '#4A90D9' : '#fff',
              border:       msg.role === 'user' ? 'none' : '1px solid #D2DCE8',
              borderRadius: msg.role === 'user'
                            ? '18px 18px 4px 18px'
                            : '18px 18px 18px 4px',
              padding:      '12px 16px',
              boxShadow:    '0 1px 4px rgba(0,0,0,0.06)',
            }}>
              {/* Pipeline compact */}
              {msg.role === 'assistant' && (msg.pipeline_steps?.length ?? 0) > 0 && (
                <PipelineBlock
                  steps={msg.pipeline_steps}
                  sqlEvents={msg.sql_events ?? []}
                  streaming={msg.streaming ?? false}
                />
              )}

              {/* Contenu */}
              {msg.role === 'user' ? (
                <div style={{ fontSize: '14px', color: '#fff', lineHeight: 1.6 }}>
                  {msg.content}
                </div>
              ) : (
                <div
                  style={{ fontSize: '14px', color: '#1E2D41', lineHeight: 1.7 }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              )}

              {/* Figures Plotly */}
              {msg.role === 'assistant' && (msg.figures?.length ?? 0) > 0 && (
                <FiguresBlock figures={msg.figures} />
              )}

              {/* Curseur streaming */}
              {msg.streaming && msg.role === 'assistant' && (
                <span style={{
                  display: 'inline-block', width: '2px', height: '16px',
                  background: '#4A78AF', marginLeft: '2px',
                  verticalAlign: 'text-bottom',
                  animation: 'blink 1s step-end infinite',
                }}/>
              )}

              <div style={{
                fontSize: '11px',
                color: msg.role === 'user' ? 'rgba(255,255,255,0.6)' : '#9CAAB8',
                marginTop: '6px', textAlign: 'right',
              }}>
                {new Date(msg.created_at).toLocaleTimeString('fr-FR', {
                  hour: '2-digit', minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>

      <InputBar
        input={input} streaming={streaming}
        textareaRef={textareaRef}
        handleInput={handleInput}
        handleKey={handleKey}
        handleSend={handleSend}
      />
    </div>
  )
}

function InputBar({ input, streaming, textareaRef, handleInput, handleKey, handleSend }: any) {
  return (
    <div style={{
      padding: '12px 10%', background: '#fff', borderTop: '1px solid #E2EAF2',
    }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {SUGGESTIONS.map(s => (
          <button key={s} style={{
            padding: '5px 14px', background: '#F0F4F8',
            border: '1px solid #D2DCE8', borderRadius: '14px',
            color: '#4A78AF', fontSize: '12px', cursor: 'pointer',
          }}>{s}</button>
        ))}
      </div>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: '10px',
        background: '#F7F9FC', border: '1.5px solid #D2DCE8',
        borderRadius: '14px', padding: '10px 14px',
      }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKey}
          placeholder="Posez votre question à SALL..."
          rows={1}
          style={{
            flex: 1, border: 'none', outline: 'none',
            background: 'transparent', fontSize: '14px',
            color: '#1E2D41', resize: 'none', lineHeight: 1.6,
            fontFamily: "'Inter', sans-serif",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || streaming}
          style={{
            width: '38px', height: '38px', borderRadius: '10px',
            background: !input.trim() || streaming ? '#D2DCE8' : '#4A78AF',
            border: 'none', cursor: !input.trim() || streaming ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background 0.15s',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}