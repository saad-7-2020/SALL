import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import DbLoginModal from './DbLoginModal'

function groupByDate(convs: any[]) {
  const today     = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  const groups: Record<string, any[]> = {}
  for (const c of convs) {
    const d     = new Date(c.updated_at).toDateString()
    const label = d === today ? "Aujourd'hui" : d === yesterday ? 'Hier' : 'Plus ancien'
    ;(groups[label] ??= []).push(c)
  }
  return groups
}

export default function Sidebar() {
  const {
    conversations, activeConvId, loadingConvs,
    loadConversations, selectConversation,
    newConversation, deleteConversation,
    dbConnections,
  } = useStore()

  const [loginOpen,    setLoginOpen]    = useState(false)
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null)

  useEffect(() => { loadConversations() }, [])

  const connectedCount = dbConnections.filter(d => d.status === 'connected').length
  const grouped        = groupByDate(conversations)

  return (
    <>
      <aside style={{
        width:         '260px',
        minWidth:      '260px',
        height:        '100vh',
        background:    '#162436',
        display:       'flex',
        flexDirection: 'column',
        fontFamily:    "'Inter', sans-serif",
        userSelect:    'none',
      }}>

        {/* ── Logo ── */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>SALL</div>
          <div style={{ fontSize: '11px', color: '#5B8DB8', marginTop: '2px' }}>
            Smart Analytical LLM
          </div>
        </div>

        {/* ── Nouvelle conversation ── */}
        <div style={{ padding: '12px 10px 8px' }}>
          <button
            onClick={newConversation}
            style={{
              width:        '100%',
              padding:      '9px 12px',
              background:   'rgba(255,255,255,0.06)',
              border:       '1px solid rgba(255,255,255,0.10)',
              borderRadius: '8px',
              color:        '#B4C3D2',
              fontSize:     '13px',
              cursor:       'pointer',
              textAlign:    'left',
              display:      'flex',
              alignItems:   'center',
              gap:          '8px',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          >
            <span style={{ color: '#5B8DB8', fontSize: '16px' }}>+</span>
            Nouvelle conversation
          </button>
        </div>

        {/* ── Historique ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
          {loadingConvs ? (
            <div style={{ color: '#5B8DB8', fontSize: '12px', padding: '12px 8px' }}>
              Chargement...
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ color: '#4A6A8A', fontSize: '12px', padding: '16px 8px',
                          textAlign: 'center', lineHeight: 1.6 }}>
              Aucune conversation.<br/>Commencez par en créer une.
            </div>
          ) : (
            Object.entries(grouped).map(([label, convs]) => (
              <div key={label}>
                <div style={{
                  fontSize:      '11px', fontWeight: 600, color: '#4A7898',
                  padding:       '12px 8px 4px',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>
                  {label}
                </div>
                {convs.map(conv => (
                  <div
                    key={conv.id}
                    onMouseEnter={() => setHoveredConvId(conv.id)}
                    onMouseLeave={() => setHoveredConvId(null)}
                    onClick={() => selectConversation(conv.id)}
                    style={{
                      display:      'flex',
                      alignItems:   'center',
                      padding:      '8px 10px',
                      borderRadius: '7px',
                      marginBottom: '2px',
                      cursor:       'pointer',
                      background:   conv.id === activeConvId
                                    ? 'rgba(74,120,175,0.18)' : 'transparent',
                      borderLeft:   conv.id === activeConvId
                                    ? '2px solid #4A78AF' : '2px solid transparent',
                      transition:   'background 0.12s',
                    }}
                  >
                    <span style={{
                      flex:         1,
                      fontSize:     '13px',
                      color:        conv.id === activeConvId ? '#fff' : '#B4C3D2',
                      overflow:     'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace:   'nowrap',
                    }}>
                      {conv.title}
                    </span>
                    {hoveredConvId === conv.id && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteConversation(conv.id) }}
                        style={{
                          background: 'none', border: 'none',
                          color: '#5B8DB8', cursor: 'pointer', fontSize: '14px',
                        }}
                      >×</button>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* ── Séparateur ── */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}/>

        {/* ── Utilisateur + DB ── */}
        <button
          onClick={() => setLoginOpen(true)}
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        '10px',
            padding:    '12px 16px',
            background: 'none',
            border:     'none',
            cursor:     'pointer',
            width:      '100%',
            textAlign:  'left',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          title="Gérer les connexions bases de données"
        >
          {/* Avatar avec badge DB */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width:          '34px',
              height:         '34px',
              borderRadius:   '50%',
              background:     '#2A4A6B',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              color:          '#B4C3D2',
              fontSize:       '13px',
              fontWeight:     600,
            }}>U</div>
            {/* Badge connexion */}
            <div style={{
              position:     'absolute',
              bottom:       '-1px',
              right:        '-1px',
              width:        '12px',
              height:       '12px',
              borderRadius: '50%',
              background:   connectedCount > 0 ? '#34A864' : '#6B7280',
              border:       '2px solid #162436',
            }}/>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', color: '#B4C3D2', fontWeight: 500 }}>
              Utilisateur
            </div>
            <div style={{ fontSize: '11px', color: '#4A7898', marginTop: '1px' }}>
              {connectedCount > 0
                ? `${connectedCount} base${connectedCount > 1 ? 's' : ''} connectée${connectedCount > 1 ? 's' : ''}`
                : 'Aucune base connectée'}
            </div>
          </div>

          {/* Icône DB */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
               stroke="#4A7898" strokeWidth="2">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12"/>
            <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
          </svg>
        </button>
      </aside>

      {/* Modal connexion DB */}
      {loginOpen && <DbLoginModal onClose={() => setLoginOpen(false)} />}
    </>
  )
}