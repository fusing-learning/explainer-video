import fs from "node:fs";
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setCodec("h264");
Config.setCrf(20);

// Remotion's bundled chrome-headless-shell hangs on macOS 27 ("Waiting for root
// component to load"), so render with the installed Chrome. It runs with its own
// temporary profile, separate from the everyday browser session.
const SYSTEM_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (fs.existsSync(SYSTEM_CHROME) && !process.env.REMOTION_BUNDLED_CHROME) {
  Config.setBrowserExecutable(SYSTEM_CHROME);
}
