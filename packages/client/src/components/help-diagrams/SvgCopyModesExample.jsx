import SvgUiElement from "./SvgUiElement";

// SVG Example: Copy Modes
const SvgCopyModesExample = () => (
  <SvgUiElement width={520} height={220}>
    <text x="10" y="20" className="svg-text-title">
      For the Folder Itself
    </text>
    <rect x="10" y="30" width="180" height="30" rx="4" fill="#16a34a" />
    <text x="20" y="50" className="svg-text svg-highlight-text svg-text-bold">
      Yes and Check Inside
    </text>
    <rect x="10" y="70" width="180" height="30" rx="4" fill="#dc2626" />
    <text x="20" y="90" className="svg-text svg-highlight-text svg-text-bold">
      Skip Entire Folder
    </text>

    <text x="230" y="20" className="svg-text-title">
      For All Subsequent Items...
    </text>
    <rect x="230" y="30" width="130" height="30" rx="4" fill="#15803d" />
    <text x="240" y="50" className="svg-text svg-highlight-text">
      Yes to All
    </text>
    <rect x="370" y="30" width="130" height="30" rx="4" fill="#15803d" />
    <text x="380" y="50" className="svg-text svg-highlight-text">
      Copy if New
    </text>

    <rect x="230" y="70" width="130" height="30" rx="4" fill="#b91c1c" />
    <text x="240" y="90" className="svg-text svg-highlight-text">
      No to All
    </text>
    <rect x="370" y="70" width="130" height="30" rx="4" fill="#b45309" />
    <text x="380" y="90" className="svg-text svg-highlight-text">
      Skip if Empty
    </text>

    <rect x="230" y="110" width="130" height="30" rx="4" fill="#0369a1" />
    <text x="240" y="130" className="svg-text svg-highlight-text">
      Size Differs
    </text>
    <rect x="370" y="110" width="130" height="30" rx="4" fill="#0369a1" />
    <text x="380" y="130" className="svg-text svg-highlight-text">
      Replace Smaller
    </text>

    <rect x="10" y="165" width="490" height="1" fill="#4b5563" />

    <rect x="280" y="180" width="220" height="30" rx="4" fill="#4b5563" />
    <text x="290" y="200" className="svg-text svg-highlight-text">
      Cancel Entire Operation
    </text>
  </SvgUiElement>
);

export default SvgCopyModesExample;
