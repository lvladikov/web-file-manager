// SVG Example: F-Key Action Bar
const SvgActionBarExample = () => (
  <SvgUiElement width={600} height={50}>
    <g>
      <rect x="10" y="10" width="70" height="30" rx="4" fill="#374151" />
      <text x="20" y="30" className="svg-text">
        <tspan className="svg-text-bold">F1</tspan> Help
      </text>
    </g>
    <g>
      <rect x="90" y="10" width="85" height="30" rx="4" fill="#374151" />
      <text x="100" y="30" className="svg-text">
        <tspan className="svg-text-bold">F2</tspan> Rename
      </text>
    </g>
    <g>
      <rect x="185" y="10" width="70" height="30" rx="4" fill="#374151" />
      <text x="195" y="30" className="svg-text">
        <tspan className="svg-text-bold">F3</tspan> View
      </text>
    </g>
    <g>
      <rect x="265" y="10" width="70" height="30" rx="4" fill="#374151" />
      <text x="275" y="30" className="svg-text">
        <tspan className="svg-text-bold">F5</tspan> Copy
      </text>
    </g>
    <text x="345" y="30" className="svg-text">
      ...
    </text>
  </SvgUiElement>
);

export default SvgActionBarExample;
