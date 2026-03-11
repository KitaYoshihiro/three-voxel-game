import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const [, , urlArg, labelArg = "local"] = process.argv;

if (!urlArg) {
  console.error("Usage: node scripts/run-qa.mjs <url> [label]");
  process.exit(1);
}

const outputDir = path.resolve("artifacts", labelArg);
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=swiftshader", "--disable-gpu-sandbox"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const messages = [];

function step(name) {
  console.error(`[qa:${labelArg}] ${name}`);
}

page.on("console", (message) => {
  messages.push({ type: message.type(), text: message.text() });
});

page.on("pageerror", (error) => {
  messages.push({ type: "pageerror", text: String(error) });
});

page.on("crash", () => {
  messages.push({ type: "crash", text: "Page crashed" });
});

page.on("close", () => {
  messages.push({ type: "close", text: "Page closed" });
});

const getState = () => page.evaluate(() => window.__voxelGame.getState());
const getTarget = () => page.evaluate(() => window.__voxelGame.getTargetBlock());
const center = { x: 720, y: 450 };

function movementProjection(from, to, axis) {
  const dx = to.playerPosition.x - from.playerPosition.x;
  const dz = to.playerPosition.z - from.playerPosition.z;
  return Number((dx * axis.x + dz * axis.z).toFixed(3));
}

async function capture(name) {
  const file = path.join(outputDir, `${name}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 85, timeout: 10000 });
  return file;
}

async function relockPointer() {
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(180);
}

step("goto");
await page.goto(urlArg, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(600);

step("initial-screenshot");
const initialShot = await capture("initial");

step("pointer-lock");
await page.mouse.click(center.x, center.y);
await page.waitForTimeout(250);
const start = await getState();
let initialTarget = await getTarget();
if (!initialTarget) {
  await page.evaluate(() => window.__voxelGame.debugLook(0, 48));
  await page.waitForTimeout(120);
  initialTarget = await getTarget();
}

step("break");
const beforeBreak = await getState();
await page.mouse.click(center.x, center.y, { button: "left" });
await page.waitForTimeout(180);
const afterBreak = await getState();
await page.evaluate(() => document.exitPointerLock());
await page.waitForTimeout(120);
step("break-screenshot");
const afterBreakShot = await capture("after-break");
await relockPointer();

step("select-and-place");
step("reset-for-place");
await page.goto(urlArg, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(300);
await relockPointer();
let placeTarget = await getTarget();
if (!placeTarget) {
  await page.evaluate(() => window.__voxelGame.debugLook(0, 48));
  await page.waitForTimeout(120);
  placeTarget = await getTarget();
}
await page.keyboard.press("5");
await page.waitForTimeout(120);
const afterSelect5 = await getState();
await page.mouse.click(center.x, center.y, { button: "right" });
await page.waitForTimeout(180);
const afterPlace = await getState();
await page.evaluate(() => document.exitPointerLock());
await page.waitForTimeout(120);
step("place-screenshot");
const afterPlaceShot = await capture("after-place");

step("reset-scene");
await page.goto(urlArg, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(300);
await relockPointer();
const movementStart = await getState();
const forwardVector = { x: -Math.sin(movementStart.rotation.yaw), z: -Math.cos(movementStart.rotation.yaw) };
const rightVector = { x: -forwardVector.z, z: forwardVector.x };

step("movement");
await page.keyboard.down("w");
await page.waitForTimeout(900);
await page.keyboard.up("w");
const afterW = await getState();

await page.keyboard.down("s");
await page.waitForTimeout(900);
await page.keyboard.up("s");
const afterS = await getState();

await page.keyboard.down("d");
await page.waitForTimeout(700);
await page.keyboard.up("d");
const afterD = await getState();

await page.keyboard.down("a");
await page.waitForTimeout(700);
await page.keyboard.up("a");
const afterA = await getState();

step("look");
await page.mouse.move(center.x + 180, center.y - 100);
await page.waitForTimeout(120);
let afterLook = await getState();
let lookMode = "pointer-lock";
if (afterLook.rotation.yaw === movementStart.rotation.yaw && afterLook.rotation.pitch === movementStart.rotation.pitch) {
  await page.evaluate(() => window.__voxelGame.debugLook(180, -100));
  await page.waitForTimeout(120);
  afterLook = await getState();
  lookMode = "debug-fallback";
}
await page.evaluate(() => document.exitPointerLock());
await page.waitForTimeout(120);
step("moving-screenshot");
const movingShot = await capture("moving");
await relockPointer();

step("jump");
step("reset-for-jump");
await page.goto(urlArg, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(300);
await relockPointer();
await page.waitForFunction(() => window.__voxelGame.getState().onGround === true, { timeout: 3000 });
const beforeJump = await getState();
await page.keyboard.press(" ");
await page.waitForFunction(() => window.__voxelGame.getState().onGround === false, { timeout: 1000 });
await page.waitForTimeout(250);
const jumpPeak = await getState();
await page.waitForFunction(() => window.__voxelGame.getState().onGround === true, { timeout: 4000 });
const afterJump = await getState();

step("resize");
await page.evaluate(() => document.exitPointerLock());
await page.waitForTimeout(120);
await page.setViewportSize({ width: 540, height: 960 });
await page.waitForTimeout(250);
const resizeShot = await capture("after-resize");

const result = {
  url: urlArg,
  label: labelArg,
  pointerLock: start.pointerLocked,
  movement: {
    forward: movementProjection(movementStart, afterW, forwardVector),
    backward: movementProjection(afterW, afterS, forwardVector),
    right: movementProjection(afterS, afterD, rightVector),
    left: movementProjection(afterD, afterA, rightVector),
  },
  look: {
    yawDelta: Number((afterLook.rotation.yaw - movementStart.rotation.yaw).toFixed(3)),
    pitchDelta: Number((afterLook.rotation.pitch - movementStart.rotation.pitch).toFixed(3)),
    mode: lookMode,
  },
  jump: {
    startY: beforeJump.playerPosition.y,
    peakY: jumpPeak.playerPosition.y,
    endY: afterJump.playerPosition.y,
    landed: afterJump.onGround,
  },
  blockBreak: {
    target: initialTarget,
    before: beforeBreak.blockCount,
    after: afterBreak.blockCount,
  },
  blockSelect: {
    selectedId: afterSelect5.selectedBlockId,
    selectedName: afterSelect5.selectedBlockName,
  },
  blockPlace: {
    target: placeTarget,
    before: afterSelect5.blockCount,
    after: afterPlace.blockCount,
  },
  screenshots: {
    initial: initialShot,
    moving: movingShot,
    afterBreak: afterBreakShot,
    afterPlace: afterPlaceShot,
    afterResize: resizeShot,
  },
  consoleMessages: messages.filter((entry) => entry.type !== "debug"),
};

result.passes = {
  pointerLock: result.pointerLock === true,
  moveForward: result.movement.forward > 0.45,
  moveBackward: result.movement.backward < -0.45,
  moveRight: result.movement.right > 0.4,
  moveLeft: result.movement.left < -0.4,
  look: Math.abs(result.look.yawDelta) > 0.1 || Math.abs(result.look.pitchDelta) > 0.1,
  jump: result.jump.peakY > result.jump.startY + 0.2 && result.jump.landed,
  break: result.blockBreak.after === result.blockBreak.before - 1,
  select5: result.blockSelect.selectedId === 5,
  place: result.blockPlace.after === result.blockPlace.before + 1,
};

console.log(JSON.stringify(result, null, 2));

step("close");
await browser.close();
