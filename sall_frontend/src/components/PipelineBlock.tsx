import { useState } from 'react'
import type { PipelineStep, SqlEvent } from '../types'

const STEP_ICON: Record<string, string> = {
  brief:    '🧠', rag: '🔍', logic: '⚙️', analyzer: '📊', expert: '✍️',
}
const STATUS_DOT: Record<string, string> = {
  pending: '#D1D5DB', running: '#F59E0B', done: '#34A864', error: '#EF4444',
}

interface Props {
  steps:     PipelineStep[]
  sqlEvents: SqlEvent[]
  streaming: boolean
}

export default function PipelineBlock({ steps, sqlEvents, streaming }: Props) {
  const [expanded,    setExpanded]    = useState(false)
  const [openSqlIdx,  setOpenSqlIdx]  = useState<number | null>(null)

  const doneCount   = steps.filter(s => s.status === 'done').length
  const currentStep = steps.find(s => s.status === 'running')
  const totalRows   = sqlEvents.reduce((a, e) => a + e.rows, 0)

  // ── Ligne compacte ─────────────────────────────────────────────
  const compact = (
    <div style={{
      display:     'flex',
      alignItems:  'center',
      gap:         '6px',
      padding:     '6px 10px',
      background:  '#EEF3FB',
      borderRadius: expanded ? '8px 8px 0 0' : '8px',
      border:      '1px solid #C8D8EE',
      cursor:      'pointer',
      userSelect:  'none',
    }}
    onClick={() => setExpanded(o => !o)}
    >
      {/* Pastilles étapes */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        {steps.map(s => (
          <div key={s.step} title={s.label} style={{
            display:    'flex',
            alignItems: 'center',
            gap:        '3px',
            fontSize:   '11px',
          }}>
            <div style={{
              width:        '7px',
              height:       '7px',
              borderRadius: '50%',
              background:   STATUS_DOT[s.status],
              flexShrink:   0,
              ...(s.status === 'running' ? { animation: 'pulse 1.2s ease-in-out infinite' } : {}),
            }}/>
          </div>
        ))}
      </div>

      {/* Texte inline */}
      <span style={{ fontSize: '12px', color: '#4A6A8A', flex: 1 }}>
        {streaming && currentStep
          ? <><span style={{ color: '#C8A028' }}>{currentStep.label}</span>...</>
          : <>{doneCount}/{steps.length} étapes{totalRows > 0 && ` · ${totalRows} lignes`}</>
        }
      </span>

      {/* Compteur SQL si disponible */}
      {sqlEvents.length > 0 && !streaming && (
        <span style={{
          fontSize:     '11px',
          color:        '#5B8DB8',
          background:   '#DCEAF5',
          padding:      '2px 7px',
          borderRadius: '10px',
          whiteSpace:   'nowrap',
        }}>
          {sqlEvents.length} requête{sqlEvents.length > 1 ? 's' : ''}
        </span>
      )}

      {/* Toggle */}
      <span style={{
        fontSize:   '10px',
        color:      '#9CAAB8',
        transform:  expanded ? 'rotate(180deg)' : 'none',
        transition: 'transform 0.2s',
        display:    'inline-block',
      }}>▼</span>
    </div>
  )

  // ── Détails déroulés ───────────────────────────────────────────
  const details = expanded && (
    <div style={{
      background:   '#F7FAFD',
      border:       '1px solid #C8D8EE',
      borderTop:    'none',
      borderRadius: '0 0 8px 8px',
      padding:      '10px 12px',
    }}>
      {/* Étapes avec labels */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
        {steps.map(s => (
          <div key={s.step} style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '5px',
            padding:      '4px 9px',
            borderRadius: '5px',
            background:   `${STATUS_DOT[s.status]}18`,
            border:       `1px solid ${STATUS_DOT[s.status]}50`,
            fontSize:     '11px',
          }}>
            <span>{STEP_ICON[s.step]}</span>
            <span style={{ color: STATUS_DOT[s.status], fontWeight: 600 }}>{s.label}</span>
            {s.detail && <span style={{ color: '#9CA3AF' }}>· {s.detail}</span>}
            {s.status === 'done'    && <span style={{ color: '#34A864' }}>✓</span>}
            {s.status === 'running' && <span style={{ color: '#F59E0B' }}>...</span>}
          </div>
        ))}
      </div>

      {/* Requêtes SQL dépliables */}
      {sqlEvents.length > 0 && (
        <>
          <div style={{ fontSize: '11px', color: '#4A7898', fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '0.4px',
                        marginBottom: '5px' }}>
            Requêtes SQL
          </div>
          {sqlEvents.map((ev, i) => (
            <div key={i} style={{
              border:       '1px solid #D2DCE8',
              borderRadius: '6px',
              marginBottom: '4px',
              overflow:     'hidden',
            }}>
              <button
                onClick={() => setOpenSqlIdx(openSqlIdx === i ? null : i)}
                style={{
                  width:      '100%',
                  display:    'flex',
                  alignItems: 'center',
                  gap:        '8px',
                  padding:    '6px 10px',
                  background: '#EEF3FB',
                  border:     'none',
                  cursor:     'pointer',
                  fontSize:   '11px',
                  textAlign:  'left',
                }}
              >
                <span style={{ color: '#4A78AF', fontWeight: 600 }}>#{ev.index}</span>
                <span style={{ flex: 1, color: '#2E4A6A', overflow: 'hidden',
                               textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.description}
                </span>
                <span style={{ color: '#5B8DB8', whiteSpace: 'nowrap' }}>
                  {ev.rows} lignes
                </span>
                <span style={{ color: '#9CAAB8', fontSize: '10px' }}>
                  {openSqlIdx === i ? '▲' : '▼'}
                </span>
              </button>
              {openSqlIdx === i && (
                <pre style={{
                  margin:     0,
                  padding:    '10px 12px',
                  background: '#1C2636',
                  color:      '#A8D8A0',
                  fontSize:   '11px',
                  fontFamily: "'JetBrains Mono', monospace",
                  overflowX:  'auto',
                  maxHeight:  '180px',
                  overflowY:  'auto',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}>
                  {ev.query}
                </pre>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )

  return (
    <div style={{ marginBottom: '10px', fontSize: '12px' }}>
      {compact}
      {details}
    </div>
  )
}