import Sidebar  from './components/Sidebar'
import ChatArea from './components/ChatArea'

export default function App() {
  return (
    <div style={{
      display:    'flex',
      height:     '100vh',
      overflow:   'hidden',
      fontFamily: "'Inter', sans-serif",
    }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #F0F4F8; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #B4C8E1; border-radius: 4px; }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
      <Sidebar  />
      <ChatArea />
    </div>
  )
}