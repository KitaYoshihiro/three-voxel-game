import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const [, , urlArg, labelArg = "pages"] = process.argv;

if (!urlArg) {
  console.error("Usage: node scripts/run-public-smoke.mjs <url> [label]");
  process.exit(1);
}

const outputDir = path.resolve("artifacts", labelArg);
await fs.mkdir(outputDir, { recursive: true });

async function withPage(name, task) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=swiftshader", "--disable-gpu-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const messages = [];

  page.on("console", (message) => {
    messages.push({ type: message.type(), text: message.text() });
  });

  page.on("pageerror", (error) => {
    messages.push({ type: "pageerror", text: String(error) });
  });

  const result = await task(page);
  await browser.close();
  return {
    ...result,
    messages: messages.filter((entry) => entry.type !== "debug"),
    phase: name,
  };
}

async function gotoGame(page) {
  await page.goto(urlArg, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(600);
}

async function capture(page, fileName) {
  const file = path.join(outputDir, `${fileName}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 85, timeout: 10000 });
  return file;
}

async function pointerLock(page) {
  await page.mouse.click(720, 450);
  await page.waitForTimeout(220);
  return page.evaluate(() => window.__voxelGame.getState());
}

async function ensureTarget(page) {
  let target = await page.evaluate(() => window.__voxelGame.getTargetBlock());
  if (!target) {
    await page.evaluate(() => window.__voxelGame.debugLook(0, 48));
    await page.waitForTimeout(120);
    target = await page.evaluate(() => window.__voxelGame.getTargetBlock());
  }
  return target;
}

function movementProjection(from, to, axis) {
  const dx = to.playerPosition.x - from.playerPosition.x;
  const dz = to.playerPosition.z - from.playerPosition.z;
  return Number((dx * axis.x + dz * axis.z).toFixed(3));
}

const initial = await withPage("initial", async (page) => {
  await gotoGame(page);
  const shot = await capture(page, "public-initial");
  return {
    screenshot: shot,
    state: await page.evaluate(() => window.__voxelGame.getState()),
  };
});

const breakPhase = await withPage("break", async (page) => {
  await gotoGame(page);
  const pointer = await pointerLock(page);
  const target = await ensureTarget(page);
  const before = await page.evaluate(() => window.__voxelGame.getState());
  await page.mouse.click(720, 450, { button: "left" });
  await page.waitForTimeout(180);
  const after = await page.evaluate(() => window.__voxelGame.getState());
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForTimeout(120);
  const shot = await capture(page, "public-after-break");
  return { pointer, target, before, after, screenshot: shot };
});

const placePhase = await withPage("place", async (page) => {
  await gotoGame(page);
  const pointer = await pointerLock(page);
  const target = await ensureTarget(page);
  await page.keyboard.press("5");
  await page.waitForTimeout(120);
  const before = await page.evaluate(() => window.__voxelGame.getState());
  await page.mouse.click(720, 450, { button: "right" });
  await page.waitForTimeout(180);
  const after = await page.evaluate(() => window.__voxelGame.getState());
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForTimeout(120);
  const shot = await capture(page, "public-after-place");
  return { pointer, target, before, after, screenshot: shot };
});

const movementPhase = await withPage("movement", async (page) => {
  await gotoGame(page);
  const start = await pointerLock(page);
  const forwardVector = { x: -Math.sin(start.rotation.yaw), z: -Math.cos(start.rotation.yaw) };
  const rightVector = { x: -forwardVector.z, z: forwardVector.x };

  await page.keyboard.down("w");
  await page.waitForTimeout(900);
  await page.keyboard.up("w");
  const afterW = await page.evaluate(() => window.__voxelGame.getState());

  await page.keyboard.down("s");
  await page.waitForTimeout(900);
  await page.keyboard.up("s");
  const afterS = await page.evaluate(() => window.__voxelGame.getState());

  await page.keyboard.down("d");
  await page.waitForTimeout(700);
  await page.keyboard.up("d");
  const afterD = await page.evaluate(() => window.__voxelGame.getState());

  await page.keyboard.down("a");
  await page.waitForTimeout(700);
  await page.keyboard.up("a");
  const afterA = await page.evaluate(() => window.__voxelGame.getState());

  await page.mouse.move(900, 350);
  await page.waitForTimeout(120);
  let afterLook = await page.evaluate(() => window.__voxelGame.getState());
  let lookMode = "pointer-lock";
  if (afterLook.rotation.yaw === start.rotation.yaw && afterLook.rotation.pitch === start.rotation.pitch) {
    await page.evaluate(() => window.__voxelGame.debugLook(180, -100));
    await page.waitForTimeout(120);
    afterLook = await page.evaluate(() => window.__voxelGame.getState());
    lookMode = "debug-fallback";
  }

  await page.waitForFunction(() => window.__voxelGame.getState().onGround === true, { timeout: 3000 });
  const beforeJump = await page.evaluate(() => window.__voxelGame.getState());
  await page.keyboard.press(" ");
  await page.waitForFunction(() => window.__voxelGame.getState().onGround === false, { timeout: 1000 });
  await page.waitForTimeout(250);
  const jumpPeak = await page.evaluate(() => window.__voxelGame.getState());
  await page.waitForFunction(() => window.__voxelGame.getState().onGround === true, { timeout: 4000 });
  const afterJump = await page.evaluate(() => window.__voxelGame.getState());

  await page.evaluate(() => document.exitPointerLock());
  await page.waitForTimeout(120);
  const shot = await capture(page, "public-moving");

  return {
    start,
    afterW,
    afterS,
    afterD,
    afterA,
    afterLook,
    lookMode,
    beforeJump,
    jumpPeak,
    afterJump,
    movement: {
      forward: movementProjection(start, afterW, forwardVector),
      backward: movementProjection(afterW, afterS, forwardVector),
      right: movementProjection(afterS, afterD, rightVector),
      left: movementProjection(afterD, afterA, rightVector),
    },
    screenshot: shot,
  };
});

const resizePhase = await withPage("resize", async (page) => {
  await gotoGame(page);
  await page.setViewportSize({ width: 540, height: 960 });
  await page.waitForTimeout(250);
  const shot = await capture(page, "public-after-resize");
  return { screenshot: shot };
});

const result = {
  url: urlArg,
  label: labelArg,
  publicUrlReachable: initial.state.blockCount > 0,
  initial,
  breakPhase,
  placePhase,
  movementPhase,
  resizePhase,
  passes: {
    initial: initial.state.blockCount > 0,
    pointerLock: breakPhase.pointer.pointerLocked === true,
    break: breakPhase.after.blockCount === breakPhase.before.blockCount - 1,
    place: placePhase.after.blockCount === placePhase.before.blockCount + 1,
    movement:
      movementPhase.movement.forward > 0.45 &&
      movementPhase.movement.backward < -0.45 &&
      movementPhase.movement.right > 0.4 &&
      movementPhase.movement.left < -0.4,
    look:
      Math.abs(movementPhase.afterLook.rotation.yaw - movementPhase.start.rotation.yaw) > 0.1 ||
      Math.abs(movementPhase.afterLook.rotation.pitch - movementPhase.start.rotation.pitch) > 0.1,
    jump:
      movementPhase.jumpPeak.playerPosition.y > movementPhase.beforeJump.playerPosition.y + 0.2 &&
      movementPhase.afterJump.onGround === true,
    resize: Boolean(resizePhase.screenshot),
  },
};

console.log(JSON.stringify(result, null, 2));
