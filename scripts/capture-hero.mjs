import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const [, , urlArg, outputArg = "docs/hero.jpg"] = process.argv;

if (!urlArg) {
  console.error("Usage: node scripts/capture-hero.mjs <url> [outputPath]");
  process.exit(1);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=swiftshader", "--disable-gpu-sandbox"],
});

const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(urlArg, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(700);

await page.evaluate(() => {
  document.querySelector("#status")?.classList.add("is-hidden");
  document.querySelector("#status")?.setAttribute("aria-hidden", "true");
  document.querySelector(".panel")?.setAttribute("style", "display:none");
  window.__voxelGame.debugLook(-72, 18);
});
await page.waitForTimeout(200);

const outputPath = path.resolve(outputArg);
await page.screenshot({ path: outputPath, type: "jpeg", quality: 88, timeout: 10000 });

console.log(outputPath);
await browser.close();
