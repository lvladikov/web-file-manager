import { LoaderCircle, FileAudio, XCircle, Search } from "lucide-react";

export default function AudioPreview({
  coverArtUrl,
  audioRef,
  item,
  fullPath,
  lyrics,
  lyricsLoading,
  lyricsError,
  autoLoadLyrics,
  onToggleAutoLoadLyrics,
  handleFindLyrics,
  setLyrics,
  setLyricsError,
}) {
  return (
    <div className="flex flex-col p-6 bg-gray-800 h-full rounded-b-lg overflow-hidden">
      <div className="flex-shrink-0 flex items-center space-x-6 mb-4">
        {coverArtUrl ? (
          <img
            src={coverArtUrl}
            alt="Album Cover"
            className="w-28 h-28 object-cover rounded-md shadow-lg"
          />
        ) : (
          <FileAudio className="w-28 h-28 text-gray-600 flex-shrink-0" />
        )}
        <div className="flex-grow min-w-0">
          <p
            className="font-mono text-gray-300 text-lg break-words"
            title={item.name}
          >
            {item.name}
          </p>
          <audio
            ref={audioRef}
            src={`/api/media-stream?path=${encodeURIComponent(fullPath)}`}
            controls
            autoPlay
            className="w-full mt-3"
          />
        </div>
      </div>

      <div
        className={`flex-grow min-h-0 mt-3 flex flex-col border-t border-gray-700 pt-4 ${
          !lyrics ? "items-center justify-center" : ""
        }`}
      >
        {!lyrics && !lyricsLoading && !lyricsError && (
          <div className="flex flex-col items-center space-y-3">
            <button
              onClick={handleFindLyrics}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg flex items-center"
            >
              <Search className="w-5 h-5 mr-2" /> Find Lyrics
            </button>
            <label className="flex items-center space-x-2 text-sm text-gray-400 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={autoLoadLyrics}
                onChange={onToggleAutoLoadLyrics}
                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-sky-500 focus:ring-sky-500 focus:ring-offset-gray-800"
              />
              <span>Auto-Load Lyrics</span>
            </label>
          </div>
        )}
        {lyricsLoading && (
          <LoaderCircle className="w-8 h-8 animate-spin text-sky-400" />
        )}
        {lyricsError && (
          <div className="text-center">
            <p className="text-red-400 mb-3">{lyricsError}</p>
            <button
              onClick={handleFindLyrics}
              className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg"
            >
              Try Again
            </button>
          </div>
        )}
        {lyrics && (
          <>
            <div className="flex justify-between items-center mb-2 flex-shrink-0">
              <h4 className="text-lg font-bold text-gray-300">Lyrics</h4>
              <button
                onClick={() => {
                  setLyrics(null);
                  setLyricsError(null);
                }}
                title="Hide Lyrics"
                className="p-1 text-gray-400 hover:text-white"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <pre className="flex-grow min-h-0 overflow-y-auto text-gray-300 text-sm bg-gray-900/50 p-3 rounded-md">
              {lyrics}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
