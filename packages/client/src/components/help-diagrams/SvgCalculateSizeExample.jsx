import SvgUiElement from "./SvgUiElement";

const SvgCalculateSizeExample = () => (
  <SvgUiElement width={300} height={120}>
    {/* Background for the modal */}
    <rect x="10" y="10" width="280" height="100" rx="8" fill="#374151" className="svg-border" />

    {/* Title */}
    <text x="25" y="35" className="svg-text-title" fill="#93c5fd">
      Calculating Folder Size...
    </text>

    {/* Current File */}
    <text x="25" y="60" className="svg-text svg-text-light">
      Processing: /path/to/large_file.zip
    </text>

    {/* Progress Bar / Spinner */}
    <circle cx="260" cy="30" r="10" fill="none" stroke="#60a5fa" strokeWidth="3" strokeDasharray="15 10" className="svg-animate-spin" />

    {/* Size So Far */}
    <text x="25" y="85" className="svg-text svg-text-bold">
      Size so far: 1.2 GB
    </text>

    {/* Cancel Button */}
    <rect x="200" y="75" width="70" height="25" rx="4" fill="#dc2626" />
    <text x="210" y="92" className="svg-text svg-highlight-text">
      Cancel
    </text>
  </SvgUiElement>
);

export default SvgCalculateSizeExample;
