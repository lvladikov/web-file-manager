const ActionBar = ({ buttons }) => (
  <div className="bg-gray-900 p-2 flex items-center justify-center space-x-2">
    {buttons.map((btn) => (
      <button
        key={btn.f_key}
        onClick={btn.action}
        disabled={btn.disabled}
        className="bg-gray-700 hover:bg-sky-600 text-white px-3 py-1.5 rounded-md flex items-center text-sm disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed"
      >
        <span className="font-bold mr-1.5">{btn.f_key}</span>
        {btn.label}
      </button>
    ))}
  </div>
);

export default ActionBar;
