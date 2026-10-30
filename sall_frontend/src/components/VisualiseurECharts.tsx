import React from 'react';
import ReactECharts from 'echarts-for-react';

interface VisualiseurProps {
  visualisation: {
    title?: string;
    type?: string;
    echarts_option: any;
  };
}

export default function VisualiseurECharts({ visualisation }: VisualiseurProps) {
  if (!visualisation || !visualisation.echarts_option) {
    return null; // Ne rien afficher si les données du graphique sont absentes
  }

  return (
    <div style={{ marginTop: '15px', width: '100%' }}>
      <h4 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: '600', color: '#374151' }}>
        {visualisation.title || "Graphique"}
      </h4>
      
      <ReactECharts
        option={visualisation.echarts_option}
        notMerge={true}
        lazyUpdate={true}
        style={{ height: '350px', width: '100%' }}
        opts={{ renderer: 'svg' }} // Rendu SVG ultra net
      />
    </div>
  );
}