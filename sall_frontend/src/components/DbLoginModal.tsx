import { useState } from 'react'
import { useStore } from '../store/useStore'

interface Props {
  onClose: () => void
}

const STATUS_COLOR = { connected: '#34A864', error: '#EF4444', pending: '#9CA3AF' }
const STATUS_LABEL = { connected: 'Connecté', error: 'Erreur', pending: 'Non testé' }

const inputStyle: React.CSSProperties = {
  width:        '100%',
  padding:      '9px 12px',
  border:       '1px solid #D2DCE8',
  borderRadius: '7px',
  fontSize:     '13px',
  color:        '#1E2D41',
  outline:      'none',
  fontFamily:   "'Inter', sans-serif",
  boxSizing:    'border-box',
  background:   '#FAFBFC',
}

export default function DbLoginModal({ onClose }: Props) {
  const { dbConnections, addDbConnection, removeDbConnection, updateDbStatus } = useStore()

  const [form, setForm] = useState({
    name:     '',
    host:     'localhost',
    port:     '5432',
    user:     '',
    password: '',
  })
  const [testing, setTesting] = useState<string | null>(null)
  const [error,   setError]   = useState('')

  const handleAdd = () => {
    if (!form.name || !form.host || !form.user) {
      setError('Nom, host et utilisateur sont obligatoires')
      return
    }
    setError('')
    addDbConnection({
      name:     form.name,
      host:     `${form.host}:${form.port}/${form.name}`,
      user:     form.user,
      password: form.password,
    })
    setForm({ name: '', host: 'localhost', port: '5432', user: '', password: '' })
  }

  const handleTest = async (conn: any) => {
    setTesting(conn.id)
    try {
      const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
      const r = await fetch(`${BASE}/databases/connect`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name: conn.name, host: conn.host,
          user: conn.user, password: conn.password,
        }),
      })
      updateDbStatus(conn.id, r.ok ? 'connected' : 'error')
    } catch {
      updateDbStatus(conn.id, 'error')
    } finally {
      setTesting(null)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position:       'fixed', inset: 0,
        background:     'rgba(0,0,0,0.50)',
        zIndex:         1000,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:        '420px',
          maxHeight:    '85vh',
          overflowY:    'auto',
          background:   '#fff',
          borderRadius: '14px',
          padding:      '28px',
          boxShadow:    '0 20px 60px rgba(0,0,0,0.22)',
          fontFamily:   "'Inter', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '22px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="#4A78AF" strokeWidth="2">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12"/>
            <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
          </svg>
          <span style={{ marginLeft: '10px', fontSize: '16px', fontWeight: 700, color: '#1E2D41' }}>
            Connexion base de données
          </span>
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none',
                     fontSize: '20px', color: '#9CA3AF', cursor: 'pointer' }}
          >×</button>
        </div>

        {/* Connexions existantes */}
        {dbConnections.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280',
                          textTransform: 'uppercase', letterSpacing: '0.4px',
                          marginBottom: '8px' }}>
              Bases configurées
            </div>
            {dbConnections.map(conn => (
              <div key={conn.id} style={{
                display:      'flex',
                alignItems:   'center',
                gap:          '10px',
                padding:      '10px 12px',
                background:   '#F7F9FC',
                border:       '1px solid #E2EAF2',
                borderRadius: '8px',
                marginBottom: '6px',
              }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: STATUS_COLOR[conn.status], flexShrink: 0,
                }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E2D41' }}>
                    {conn.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9CA3AF',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conn.user}@{conn.host}
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: STATUS_COLOR[conn.status], whiteSpace: 'nowrap' }}>
                  {STATUS_LABEL[conn.status]}
                </span>
                <button
                  onClick={() => handleTest(conn)}
                  disabled={testing === conn.id}
                  style={{
                    padding: '4px 10px', background: 'none',
                    border: '1px solid #B4C8E1', borderRadius: '6px',
                    fontSize: '11px', color: '#4A78AF', cursor: 'pointer',
                  }}
                >
                  {testing === conn.id ? '...' : 'Tester'}
                </button>
                <button
                  onClick={() => removeDbConnection(conn.id)}
                  style={{ background: 'none', border: 'none', color: '#D1D5DB',
                           cursor: 'pointer', fontSize: '16px' }}
                >×</button>
              </div>
            ))}
          </div>
        )}

        {/* Séparateur */}
        <div style={{ borderTop: '1px solid #E2EAF2', marginBottom: '18px' }}/>

        {/* Formulaire — 4 champs simples */}
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280',
                      textTransform: 'uppercase', letterSpacing: '0.4px',
                      marginBottom: '14px' }}>
          Ajouter une connexion
        </div>

        {/* Nom de la base */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '5px' }}>
            Nom de la base de données
          </label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="ex : agirh_db"
            style={inputStyle}
          />
        </div>

        {/* Host + Port sur la même ligne */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <div style={{ flex: 2 }}>
            <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '5px' }}>
              Host
            </label>
            <input
              value={form.host}
              onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
              placeholder="localhost"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '5px' }}>
              Port
            </label>
            <input
              value={form.port}
              onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
              placeholder="5432"
              style={inputStyle}
            />
          </div>
        </div>

        {/* User + Password */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '5px' }}>
              Utilisateur
            </label>
            <input
              value={form.user}
              onChange={e => setForm(f => ({ ...f, user: e.target.value }))}
              placeholder="postgres"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '5px' }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>
        </div>

        {error && (
          <div style={{ color: '#EF4444', fontSize: '12px', marginBottom: '10px' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleAdd}
          style={{
            width: '100%', padding: '11px',
            background: '#4A78AF', border: 'none',
            borderRadius: '8px', color: '#fff',
            fontSize: '14px', fontWeight: 600, cursor: 'pointer',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#3A6499')}
          onMouseLeave={e => (e.currentTarget.style.background = '#4A78AF')}
        >
          + Ajouter
        </button>
      </div>
    </div>
  )
}