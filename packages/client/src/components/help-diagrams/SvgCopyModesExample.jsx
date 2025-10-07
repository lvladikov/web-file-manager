import SvgUiElement from "./SvgUiElement";

// SVG Example: Copy Modes
const SvgCopyModesExample = () => (
  <SvgUiElement width={400} height={160}>
    <text x="10" y="20" className="svg-text-title">
      For the Folder Itself
    </text>
    <rect x="10" y="30" width="150" height="30" rx="4" fill="#4ade80" />
    <text x="20" y="50" fill="black" className="svg-text svg-text-bold">
      Yes and Check Inside
    </text>
    <rect x="10" y="70" width="150" height="30" rx="4" fill="#dc2626" />
    <text x="20" y="90" className="svg-text svg-highlight-text svg-text-bold">
      Skip Entire Folder
    </text>

    <text x="200" y="20" className="svg-text-title">
      For All Subsequent Items...
    </text>
    <rect x="200" y="30" width="90" height="30" rx="4" fill="#4ade80" />
    <text x="210" y="50" fill="black" className="svg-text">
      Copy if New
    </text>
    <rect x="300" y="30" width="90" height="30" rx="4" fill="#dc2626" />
    <text x="310" y="50" className="svg-text svg-highlight-text">
      No to All
    </text>

    <rect x="200" y="70" width="90" height="30" rx="4" fill="#0ea5e9" />
    <text x="210" y="90" className="svg-text svg-highlight-text">
      Size Differs
    </text>
    <rect x="300" y="70" width="90" height="30" rx="4" fill="#d97706" />
    <text x="310" y="110" className="svg-text svg-highlight-text">
      Is Empty
    </text>
  </SvgUiElement>
);

export default SvgCopyModesExample;
