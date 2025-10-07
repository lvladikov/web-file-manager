// A helper component to render a simple UI element as an SVG
const SvgUiElement = ({ width, height, children }) => (
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
      <rect
        x="0.5"
        y="0.5"
        width={width - 1}
        height={height - 1}
        rx="6"
        className="svg-bg svg-border"
      />
      {children}
    </svg>
  </div>
);

export default SvgUiElement;
