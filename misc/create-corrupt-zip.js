const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

// This script will generate a file named 'corrupt_test_archive.zip' in the current directory.
const outputPath = path.join(__dirname, "corrupt_test_archive.zip");
const output = fs.createWriteStream(outputPath);
const archive = archiver("zip", {
  zlib: { level: 9 }, // Using default compression.
});

console.log(`Creating a heavily corrupt archive at: ${outputPath}`);

output.on("close", function () {
  const totalBytes = archive.pointer();
  console.log(
    `Initial archive created successfully. ${totalBytes} total bytes.`
  );

  try {
    const fileDescriptor = fs.openSync(outputPath, "r+");

    // Corruption 1: Damage a specific file's compressed data.
    // This should result in a file-specific error (e.g., CRC-32 mismatch).
    const fileCorruptionOffset = Math.floor(totalBytes * 0.25);
    const fileJunkData = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    fs.writeSync(
      fileDescriptor,
      fileJunkData,
      0,
      fileJunkData.length,
      fileCorruptionOffset
    );
    console.log(
      `Corruption 1 (File Data): Overwrote ${fileJunkData.length} bytes at offset ${fileCorruptionOffset}.`
    );

    // Corruption 2: Damage the central directory structure at the end of the file.
    // This should result in a more generic header or signature error.
    // We'll target an area near the end, but not the absolute end.
    const centralDirCorruptionOffset = Math.max(totalBytes - 128, 0); // Corrupt within the last 128 bytes.
    const headerJunkData = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    fs.writeSync(
      fileDescriptor,
      headerJunkData,
      0,
      headerJunkData.length,
      centralDirCorruptionOffset
    );
    console.log(
      `Corruption 2 (Header): Overwrote ${headerJunkData.length} bytes at offset ${centralDirCorruptionOffset}.`
    );

    fs.closeSync(fileDescriptor);

    console.log(
      "The archive 'corrupt_test_archive.zip' is now damaged with multiple issues."
    );
  } catch (err) {
    console.error("An error occurred during the file corruption phase:", err);
  }
});

archive.on("warning", function (err) {
  if (err.code === "ENOENT") {
    console.warn("Warning:", err);
  } else {
    throw err;
  }
});

archive.on("error", function (err) {
  throw err;
});

archive.pipe(output);

// Add multiple files to make the archive structure more complex.
archive.append("This is a perfectly normal file.", { name: "docs/readme.txt" });
archive.append("Some more content for another file.", {
  name: "assets/notes.txt",
});
archive.append(
  "This is the content of the file that will be corrupted by overwriting the archive bytes.",
  { name: "assets/corrupt_file_1.txt" }
);
archive.append("Another file to ensure the structure is non-trivial.", {
  name: "assets/sub/another_file.txt",
});
archive.append("This file should be perfectly fine.", {
  name: "final_file.txt",
});

archive.finalize();
