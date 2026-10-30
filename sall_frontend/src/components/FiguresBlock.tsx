import VisualiseurECharts from '../components/VisualiseurECharts';

// 1. On met à jour l'interface pour correspondre au nouveau format JSON d'ECharts du backend
interface FigureData {
  title: string
  type:  string
  echarts_option: any // Reçoit directement le dictionnaire d'options ECharts
}

interface Props {
  figures: FigureData[]
}

export default function FiguresBlock({ figures }: Props) {
  if (!figures || figures.length === 0) return null

  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{
        fontSize:      '11px',
        fontWeight:    600,
        color:         '#4A7898',
        textTransform: 'uppercase',
        letterSpacing: '0.4px',
        marginBottom:  '8px',
      }}>
        Visualisations
      </div>
      
      {/* Grille adaptative conservée (1 colonne si 1 graphique, 2 colonnes si plusieurs) */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: figures.length === 1 ? '1fr' : '1fr 1fr',
        gap:                 '10px',
      }}>
        {figures.map((fig, i) => (
          <div key={i} style={{
            background:   '#fff',
            border:       '1px solid #D2DCE8',
            borderRadius: '8px',
            overflow:     'hidden',
            padding:      '12px', // Un peu de padding pour que le graphique ne colle pas aux bords
            minHeight:    '340px',
          }}>
            {/* On passe la figure au composant ECharts qui s'occupe du rendu */}
            <VisualiseurECharts visualisation={fig} />
          </div>
        ))}
      </div>
    </div>
  )
}