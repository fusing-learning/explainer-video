// Render a handful of stills from one bundle + one browser (much faster than
// calling `remotion still` per frame). Used by pipeline/build.py --stills.
//   node scripts/stills.mjs <timeline.json> <public-dir> <frames.json>
// frames.json: [{"frame": 120, "out": "/abs/path.jpg"}, ...]
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";

const [timelinePath, publicDir, framesPath] = process.argv.slice(2);
const inputProps = JSON.parse(fs.readFileSync(timelinePath, "utf8"));
const frames = JSON.parse(fs.readFileSync(framesPath, "utf8"));
const SYSTEM_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserExecutable = fs.existsSync(SYSTEM_CHROME) && !process.env.REMOTION_BUNDLED_CHROME ? SYSTEM_CHROME : null;

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve(publicDir) });
const browser = await openBrowser("chrome", { browserExecutable, chromiumOptions: { gl: "swangle" } });
try {
  const composition = await selectComposition({ serveUrl, id: "Explainer", inputProps, puppeteerInstance: browser, browserExecutable });
  for (const f of frames) {
    const frame = Math.min(composition.durationInFrames - 1, Math.max(0, f.frame));
    await renderStill({ composition, serveUrl, output: f.out, frame, inputProps, imageFormat: "jpeg", jpegQuality: 85, puppeteerInstance: browser, browserExecutable, timeoutInMilliseconds: 120000 });
    console.log(f.out);
  }
} finally {
  await browser.close({ silent: true });
}
