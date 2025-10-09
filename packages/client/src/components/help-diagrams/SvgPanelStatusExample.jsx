import React from 'react';

const SvgPanelStatusExample = () => {
  const width = 400; // Define a fixed width for the SVG
  const height = 150; // Define a fixed height for the SVG

  return (
    <div className="bg-gray-900 border border-gray-600 rounded-lg p-4 flex justify-center items-center my-4 overflow-x-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <style>
          {`
            .svg-text { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; fill: #D1D5DB; }
            .svg-text-light { fill: #9CA3AF; }
            .svg-text-bold { font-weight: bold; }
            .svg-text-title { font-weight: bold; fill: #7DD3FC; }
            .svg-bg { fill: #1F2937; }
            .svg-header-bg { fill: #111827; }
            .svg-border { stroke: #4B5563; stroke-width: 1; }
            .svg-highlight-bg { fill: #2563EB; }
            .svg-highlight-text { fill: #FFFFFF; }
            .svg-icon-blue { fill: #38BDF8; }
            .svg-icon-yellow { fill: #FACC15; }
          `}
        </style>

        {/* Main panel background */}
        <rect x="0" y="0" width={width} height={height} rx="6" className="svg-bg svg-border" />

        {/* Placeholder for file list area */}
        <rect x="10" y="10" width={width - 20} height={height - 50} rx="3" fill="#2D3748" />
        <text x="20" y="30" className="svg-text svg-text-light">File List Area</text>

        {/* Bottom status bar area */}
        <rect x="0" y={height - 30} width={width} height="30" fill="#111827" stroke="#4B5563" strokeWidth="1" />

        {/* Selected items info */}
        <text x="10" y={height - 10} className="svg-text">
          <tspan>5</tspan> / 10 items selected (<tspan fill="#7DD3FC">1.2 GB</tspan>)
        </text>

        {/* Disk space info */}
        <text x={width - 10} y={height - 10} textAnchor="end" className="svg-text">
          <tspan fill="#7DD3FC">200GB</tspan> / <tspan fill="#7DD3FC">500GB</tspan> (<tspan fill="#48BB78">40%</tspan>)
        </text>
      </svg>
    </div>
  );
};

export default SvgPanelStatusExample;