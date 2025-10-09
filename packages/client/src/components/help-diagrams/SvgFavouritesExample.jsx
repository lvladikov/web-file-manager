import SvgUiElement from "./SvgUiElement";

const SvgFavouritesExample = () => (
  <SvgUiElement width={300} height={180}>
    {/* Path Bar Placeholder */}
    <rect x="10" y="10" width="280" height="30" rx="4" fill="#4b5563" />
    <text x="20" y="30" className="svg-text svg-text-light">
      /home/user/documents/
    </text>

    {/* Star Icon */}
    <polygon
      points="260,15 265,25 275,25 268,30 270,40 260,35 250,40 252,30 245,25 255,25"
      fill="#facc15" stroke="#facc15" strokeWidth="1"
    />

    {/* Dropdown Menu */}
    <rect x="10" y="45" width="280" height="125" rx="4" fill="#374151" className="svg-border" />
    <text x="20" y="65" className="svg-text svg-text-bold">Favourites</text>
    <line x1="10" y1="75" x2="290" y2="75" className="svg-border" />
    <text x="20" y="95" className="svg-text">
      /home/user/pics
    </text>
    <text x="20" y="115" className="svg-text">
      /home/user/videos
    </text>
    <line x1="10" y1="125" x2="290" y2="125" className="svg-border" />
    <text x="20" y="145" className="svg-text">
      Add to favourites
    </text>
  </SvgUiElement>
);

export default SvgFavouritesExample;
