const ImagePreview = ({ item, fullPath, isFullscreen }) => {
  return (
    <div
      className={`flex justify-center items-center bg-black rounded-b-lg overflow-hidden ${
        isFullscreen ? "w-full h-full" : ""
      }`}
      style={
        isFullscreen
          ? {}
          : {
              width: "100%",
              height: "calc(100vh - 14rem)",
              maxWidth: "90vw",
              margin: "auto",
            }
      }
    >
      <img
        src={`/api/image-preview?path=${encodeURIComponent(fullPath)}`}
        alt={item.name}
        className="object-contain rounded-b-lg"
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          width: "auto",
          height: "auto",
        }}
      />
    </div>
  );
};

export default ImagePreview;
