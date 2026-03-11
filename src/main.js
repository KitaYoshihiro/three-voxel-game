import "./style.css";
import * as THREE from "three";

const WORLD_WIDTH = 32;
const WORLD_DEPTH = 32;
const MAX_BUILD_HEIGHT = 12;
const PLAYER_RADIUS = 0.35;
const PLAYER_HEIGHT = 1.75;
const EYE_HEIGHT = 1.62;
const MOVE_SPEED = 5.2;
const AIR_CONTROL = 0.38;
const JUMP_VELOCITY = 6.6;
const GRAVITY = 18;
const REACH = 6.5;

const blockTypes = [
  { id: 1, name: "Grass", color: "#6ecb63", emissive: "#14280f" },
  { id: 2, name: "Stone", color: "#9aa7b6", emissive: "#121821" },
  { id: 3, name: "Sand", color: "#f1da8d", emissive: "#2d2105" },
  { id: 4, name: "Clay", color: "#b86d72", emissive: "#261012" },
  { id: 5, name: "Glow", color: "#8ef0ff", emissive: "#175364" },
];

const app = document.querySelector("#app");
const hotbar = document.querySelector("#hotbar");
const fpsLabel = document.querySelector("#fps");
const statusCard = document.querySelector("#status");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#8fc8ff");
scene.fog = new THREE.Fog("#8fc8ff", 26, 68);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.prepend(renderer.domElement);

const skyLight = new THREE.HemisphereLight("#d7efff", "#274243", 1.65);
scene.add(skyLight);

const sun = new THREE.DirectionalLight("#fff4d6", 1.6);
sun.position.set(18, 26, 8);
scene.add(sun);

const fillLight = new THREE.DirectionalLight("#7fd6ff", 0.45);
fillLight.position.set(-12, 10, -18);
scene.add(fillLight);

const groundPlane = new THREE.Mesh(
  new THREE.CircleGeometry(52, 64),
  new THREE.MeshBasicMaterial({ color: "#44615a", transparent: true, opacity: 0.18 }),
);
groundPlane.rotation.x = -Math.PI / 2;
groundPlane.position.y = -0.02;
scene.add(groundPlane);

const horizonRing = new THREE.Mesh(
  new THREE.TorusGeometry(30, 6, 20, 80),
  new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.05 }),
);
horizonRing.rotation.x = Math.PI / 2;
horizonRing.position.set(WORLD_WIDTH / 2, 11, WORLD_DEPTH / 2);
scene.add(horizonRing);

const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
  new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.72 }),
);
highlight.visible = false;
scene.add(highlight);

const voxelGroup = new THREE.Group();
scene.add(voxelGroup);

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const tempObject = new THREE.Object3D();
const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);
const intersections = [];

const materials = new Map(
  blockTypes.map((type) => [
    type.id,
    new THREE.MeshStandardMaterial({
      color: type.color,
      roughness: 0.92,
      metalness: 0.06,
      emissive: new THREE.Color(type.emissive),
      emissiveIntensity: type.id === 5 ? 0.5 : 0.14,
    }),
  ]),
);

const world = new Map();
const pickables = [];
let selectedBlockId = 1;
let lastFrameTime = performance.now();
let fpsAccumulator = 0;
let fpsFrames = 0;
let isPointerLocked = false;

const player = {
  position: new THREE.Vector3(WORLD_WIDTH / 2 + 0.5, 8, WORLD_DEPTH / 2 + 0.5),
  velocity: new THREE.Vector3(),
  yaw: -0.72,
  pitch: -0.18,
  onGround: false,
};

const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jumpQueued: false,
};

function resetInputState({ clearMomentum = false } = {}) {
  input.forward = false;
  input.backward = false;
  input.left = false;
  input.right = false;
  input.jumpQueued = false;

  if (clearMomentum) {
    player.velocity.x = 0;
    player.velocity.z = 0;
  }
}

for (const type of blockTypes) {
  const slot = document.createElement("button");
  slot.className = "slot";
  slot.type = "button";
  slot.innerHTML = `
    <span class="slot-key">${type.id}</span>
    <span class="slot-swatch" style="background:${type.color}"></span>
    <span class="slot-name">${type.name}</span>
  `;
  slot.addEventListener("click", () => {
    setSelectedBlock(type.id);
  });
  hotbar.append(slot);
}

function setSelectedBlock(id) {
  selectedBlockId = id;
  [...hotbar.children].forEach((element, index) => {
    element.classList.toggle("is-active", index === id - 1);
  });
  updateStatusCard();
}

setSelectedBlock(selectedBlockId);

function voxelKey(x, y, z) {
  return `${x},${y},${z}`;
}

function getBlock(x, y, z) {
  return world.get(voxelKey(x, y, z));
}

function setBlock(x, y, z, typeId) {
  if (y < 0 || y > MAX_BUILD_HEIGHT) {
    return;
  }
  world.set(voxelKey(x, y, z), typeId);
}

function removeBlock(x, y, z) {
  world.delete(voxelKey(x, y, z));
}

function isSolid(x, y, z) {
  return world.has(voxelKey(x, y, z));
}

function getTerrainHeight(x, z) {
  const ridge = Math.sin(x * 0.34) * 1.2;
  const swell = Math.cos(z * 0.29) * 1.1;
  const diagonal = Math.sin((x + z) * 0.18) * 1.5;
  return THREE.MathUtils.clamp(Math.round(3 + ridge + swell + diagonal), 1, 6);
}

function buildInitialWorld() {
  for (let x = 0; x < WORLD_WIDTH; x += 1) {
    for (let z = 0; z < WORLD_DEPTH; z += 1) {
      const height = getTerrainHeight(x, z);
      for (let y = 0; y <= height; y += 1) {
        let typeId = 2;
        if (y === height) {
          typeId = height <= 2 ? 3 : 1;
        } else if (height - y === 1) {
          typeId = height <= 2 ? 3 : 4;
        }
        setBlock(x, y, z, typeId);
      }
    }
  }

  const glowStacks = [
    [5, getTerrainHeight(5, 5) + 1, 5],
    [24, getTerrainHeight(24, 11) + 1, 11],
    [11, getTerrainHeight(11, 25) + 1, 25],
  ];

  for (const [x, y, z] of glowStacks) {
    setBlock(x, y, z, 5);
    setBlock(x, y + 1, z, 5);
  }

  const spawnHeight = getTerrainHeight(Math.floor(WORLD_WIDTH / 2), Math.floor(WORLD_DEPTH / 2));
  player.position.set(WORLD_WIDTH / 2 + 0.5, spawnHeight + 1.05, WORLD_DEPTH / 2 + 0.5);
}

function rebuildWorldMeshes() {
  pickables.length = 0;

  while (voxelGroup.children.length > 0) {
    const mesh = voxelGroup.children[0];
    voxelGroup.remove(mesh);
    if (mesh.isInstancedMesh && typeof mesh.dispose === "function") {
      mesh.dispose();
    }
    mesh.userData.instanceLookup = null;
  }

  const groupedBlocks = new Map(blockTypes.map((type) => [type.id, []]));

  for (const [key, typeId] of world.entries()) {
    const [x, y, z] = key.split(",").map(Number);
    groupedBlocks.get(typeId).push({ x, y, z });
  }

  for (const type of blockTypes) {
    const blocks = groupedBlocks.get(type.id);
    if (!blocks || blocks.length === 0) {
      continue;
    }

    const mesh = new THREE.InstancedMesh(boxGeometry, materials.get(type.id), blocks.length);
    mesh.userData.instanceLookup = blocks;

    blocks.forEach((block, index) => {
      tempObject.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
      tempObject.updateMatrix();
      mesh.setMatrixAt(index, tempObject.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    voxelGroup.add(mesh);
    pickables.push(mesh);
  }
}

function updateCamera() {
  camera.position.set(player.position.x, player.position.y + EYE_HEIGHT, player.position.z);
  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function applyLookDelta(deltaX, deltaY) {
  player.yaw -= deltaX * 0.0024;
  player.pitch -= deltaY * 0.0021;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  updateCamera();
}

function overlapsSolid(position) {
  const minX = Math.floor(position.x - PLAYER_RADIUS);
  const maxX = Math.floor(position.x + PLAYER_RADIUS);
  const minY = Math.floor(position.y);
  const maxY = Math.floor(position.y + PLAYER_HEIGHT);
  const minZ = Math.floor(position.z - PLAYER_RADIUS);
  const maxZ = Math.floor(position.z + PLAYER_RADIUS);

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        if (!isSolid(x, y, z)) {
          continue;
        }

        const intersects =
          position.x + PLAYER_RADIUS > x &&
          position.x - PLAYER_RADIUS < x + 1 &&
          position.y < y + 1 &&
          position.y + PLAYER_HEIGHT > y &&
          position.z + PLAYER_RADIUS > z &&
          position.z - PLAYER_RADIUS < z + 1;

        if (intersects) {
          return { x, y, z };
        }
      }
    }
  }

  return null;
}

function resolveAxis(axis, amount) {
  if (amount === 0) {
    return;
  }

  player.position[axis] += amount;

  let collision = overlapsSolid(player.position);
  while (collision) {
    if (axis === "x") {
      if (amount > 0) {
        player.position.x = collision.x - PLAYER_RADIUS;
      } else {
        player.position.x = collision.x + 1 + PLAYER_RADIUS;
      }
      player.velocity.x = 0;
    } else if (axis === "z") {
      if (amount > 0) {
        player.position.z = collision.z - PLAYER_RADIUS;
      } else {
        player.position.z = collision.z + 1 + PLAYER_RADIUS;
      }
      player.velocity.z = 0;
    } else {
      if (amount > 0) {
        player.position.y = collision.y - PLAYER_HEIGHT;
      } else {
        player.position.y = collision.y + 1;
        player.onGround = true;
      }
      player.velocity.y = 0;
    }
    collision = overlapsSolid(player.position);
  }
}

function updatePlayer(delta) {
  const wasOnGround = player.onGround;
  player.onGround = false;

  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const wishDirection = new THREE.Vector3();

  if (input.forward) {
    wishDirection.add(forward);
  }
  if (input.backward) {
    wishDirection.sub(forward);
  }
  if (input.right) {
    wishDirection.add(right);
  }
  if (input.left) {
    wishDirection.sub(right);
  }

  if (wishDirection.lengthSq() > 0) {
    wishDirection.normalize();
  }

  const control = wasOnGround ? 1 : AIR_CONTROL;
  const targetVelocityX = wishDirection.x * MOVE_SPEED;
  const targetVelocityZ = wishDirection.z * MOVE_SPEED;
  player.velocity.x = THREE.MathUtils.lerp(player.velocity.x, targetVelocityX, Math.min(delta * 12 * control, 1));
  player.velocity.z = THREE.MathUtils.lerp(player.velocity.z, targetVelocityZ, Math.min(delta * 12 * control, 1));

  if (wishDirection.lengthSq() === 0 && wasOnGround) {
    player.velocity.x = THREE.MathUtils.lerp(player.velocity.x, 0, Math.min(delta * 10, 1));
    player.velocity.z = THREE.MathUtils.lerp(player.velocity.z, 0, Math.min(delta * 10, 1));
  }

  if (input.jumpQueued && wasOnGround) {
    player.velocity.y = JUMP_VELOCITY;
    player.onGround = false;
  }
  input.jumpQueued = false;

  player.velocity.y -= GRAVITY * delta;

  resolveAxis("x", player.velocity.x * delta);
  resolveAxis("z", player.velocity.z * delta);
  resolveAxis("y", player.velocity.y * delta);

  if (player.position.y < -10) {
    const centerHeight = getTerrainHeight(Math.floor(WORLD_WIDTH / 2), Math.floor(WORLD_DEPTH / 2));
    player.position.set(WORLD_WIDTH / 2 + 0.5, centerHeight + 2, WORLD_DEPTH / 2 + 0.5);
    player.velocity.set(0, 0, 0);
  }

  updateCamera();
}

function getAimIntersection() {
  raycaster.setFromCamera(centerScreen, camera);
  intersections.length = 0;
  raycaster.intersectObjects(pickables, false, intersections);
  return intersections.find((entry) => entry.distance <= REACH) ?? null;
}

function updateHighlight() {
  const target = getAimIntersection();
  if (!target || target.instanceId === undefined) {
    highlight.visible = false;
    return;
  }

  const block = target.object.userData.instanceLookup[target.instanceId];
  if (!block) {
    highlight.visible = false;
    return;
  }

  highlight.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
  highlight.visible = true;
}

function canPlaceBlockAt(x, y, z) {
  if (isSolid(x, y, z) || y < 0 || y > MAX_BUILD_HEIGHT) {
    return false;
  }

  const minX = player.position.x - PLAYER_RADIUS;
  const maxX = player.position.x + PLAYER_RADIUS;
  const minY = player.position.y;
  const maxY = player.position.y + PLAYER_HEIGHT;
  const minZ = player.position.z - PLAYER_RADIUS;
  const maxZ = player.position.z + PLAYER_RADIUS;

  const intersectsPlayer =
    maxX > x &&
    minX < x + 1 &&
    maxY > y &&
    minY < y + 1 &&
    maxZ > z &&
    minZ < z + 1;

  if (intersectsPlayer) {
    return false;
  }

  return true;
}

function handleBlockAction(button) {
  const target = getAimIntersection();
  if (!target || target.instanceId === undefined) {
    return;
  }

  const block = target.object.userData.instanceLookup[target.instanceId];
  if (!block) {
    return;
  }

  if (button === 0) {
    if (block.y === 0) {
      return;
    }
    removeBlock(block.x, block.y, block.z);
    rebuildWorldMeshes();
    return;
  }

  if (button === 2 && target.face) {
    const placeX = block.x + Math.round(target.face.normal.x);
    const placeY = block.y + Math.round(target.face.normal.y);
    const placeZ = block.z + Math.round(target.face.normal.z);

    if (!canPlaceBlockAt(placeX, placeY, placeZ)) {
      return;
    }

    setBlock(placeX, placeY, placeZ, selectedBlockId);
    rebuildWorldMeshes();
  }
}

function updateFps(delta) {
  fpsAccumulator += delta;
  fpsFrames += 1;

  if (fpsAccumulator >= 0.45) {
    const fps = Math.round(fpsFrames / fpsAccumulator);
    fpsLabel.textContent = `FPS ${fps}`;
    fpsAccumulator = 0;
    fpsFrames = 0;
  }
}

function updateStatusCard() {
  statusCard.classList.toggle("is-hidden", isPointerLocked);
  statusCard.querySelector(".status-eyebrow").textContent = isPointerLocked ? "Live" : "Ready";
  statusCard.querySelector(".status-title").textContent = isPointerLocked
    ? `Selected block: ${blockTypes[selectedBlockId - 1].name}`
    : "Enter the voxel field";
  statusCard.querySelector("p").textContent = isPointerLocked
    ? "Use the hotbar or keys 1 to 5 to switch blocks. Right click places, left click clears."
    : "Click the scene to capture the mouse, then build and carve terrain with slots 1 to 5.";
}

window.__voxelGame = {
  getState() {
    return {
      pointerLocked: isPointerLocked,
      selectedBlockId,
      selectedBlockName: blockTypes[selectedBlockId - 1].name,
      playerPosition: {
        x: Number(player.position.x.toFixed(3)),
        y: Number(player.position.y.toFixed(3)),
        z: Number(player.position.z.toFixed(3)),
      },
      velocity: {
        x: Number(player.velocity.x.toFixed(3)),
        y: Number(player.velocity.y.toFixed(3)),
        z: Number(player.velocity.z.toFixed(3)),
      },
      rotation: {
        yaw: Number(player.yaw.toFixed(3)),
        pitch: Number(player.pitch.toFixed(3)),
      },
      onGround: player.onGround,
      blockCount: world.size,
      fpsText: fpsLabel.textContent,
    };
  },
  getTargetBlock() {
    const target = getAimIntersection();
    if (!target || target.instanceId === undefined) {
      return null;
    }
    const block = target.object.userData.instanceLookup[target.instanceId];
    return block ? { ...block } : null;
  },
  debugLook(deltaX, deltaY) {
    applyLookDelta(deltaX, deltaY);
    return this.getState();
  },
};

function animate() {
  const now = performance.now();
  const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  updatePlayer(delta);
  updateHighlight();
  updateFps(delta);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

buildInitialWorld();
rebuildWorldMeshes();
updateCamera();
animate();

document.addEventListener("keydown", (event) => {
  if (event.repeat) {
    return;
  }

  if (event.code === "KeyW") {
    input.forward = true;
  }
  if (event.code === "KeyS") {
    input.backward = true;
  }
  if (event.code === "KeyA") {
    input.left = true;
  }
  if (event.code === "KeyD") {
    input.right = true;
  }
  if (event.code === "Space") {
    input.jumpQueued = true;
  }

  if (/^Digit[1-5]$/.test(event.code)) {
    setSelectedBlock(Number(event.code.replace("Digit", "")));
    updateStatusCard();
  }
});

document.addEventListener("keyup", (event) => {
  if (event.code === "KeyW") {
    input.forward = false;
  }
  if (event.code === "KeyS") {
    input.backward = false;
  }
  if (event.code === "KeyA") {
    input.left = false;
  }
  if (event.code === "KeyD") {
    input.right = false;
  }
});

document.addEventListener("mousemove", (event) => {
  if (!isPointerLocked) {
    return;
  }

  applyLookDelta(event.movementX, event.movementY);
});

renderer.domElement.addEventListener("mousedown", (event) => {
  if (!isPointerLocked) {
    renderer.domElement.requestPointerLock();
    return;
  }

  handleBlockAction(event.button);
});

renderer.domElement.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

document.addEventListener("pointerlockchange", () => {
  isPointerLocked = document.pointerLockElement === renderer.domElement;
  if (!isPointerLocked) {
    resetInputState({ clearMomentum: true });
  }
  updateStatusCard();
});

window.addEventListener("blur", () => {
  resetInputState({ clearMomentum: true });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") {
    resetInputState({ clearMomentum: true });
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});
