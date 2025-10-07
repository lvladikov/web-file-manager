const Resizer = ({ onMouseDown, onDoubleClick }) => (
  <div
    style={{ gridColumn: "auto" }}
    className="w-1.5 h-full cursor-col-resize select-none bg-gray-600 hover:bg-sky-500 active:bg-sky-400"
    onMouseDown={onMouseDown}
    onDoubleClick={onDoubleClick}
  />
);

export default Resizer;
