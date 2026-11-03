import {
  mkdirSync,
  existsSync,
  copyFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
const target = "public/ocr";
mkdirSync(target, { recursive: true });
copyFileSync(
  "node_modules/tesseract.js/dist/worker.min.js",
  target + "/worker.min.js",
);
for (const file of readdirSync("node_modules/tesseract.js-core"))
  if (file.includes("lstm") && /\.wasm(?:\.js)?$/.test(file))
    copyFileSync("node_modules/tesseract.js-core/" + file, target + "/" + file);
if (!existsSync(target + "/eng.traineddata.gz")) {
  const response = await fetch(
    "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata",
  );
  if (!response.ok) throw Error("Unable to download the English OCR model.");
  writeFileSync(
    target + "/eng.traineddata.gz",
    gzipSync(Buffer.from(await response.arrayBuffer())),
  );
}
console.log("Private, same-origin OCR assets prepared.");
