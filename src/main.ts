// src/main.ts
import * as THREE from "three";
import {
  World,
  Body,
  Box as CBox,
  Vec3,
  Material,
  ContactMaterial,
} from "cannon-es";
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
type KeyColor = "red" | "green" | "blue";
// --------------------------------------------------------
// SCENE + CAMERA + RENDERER
// --------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020416);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1000, // ↑ farther clip to comfortably include scene 2
);
camera.position.set(10, 12, 14);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // ↑ crisper + stable
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(8, 15, 6);
scene.add(dirLight);

// --------------------------------------------------------
// HUD
// --------------------------------------------------------
const hudScore = document.getElementById("score")!;
const hudTime = document.getElementById("time")!;
const hudMsg = document.getElementById("message")!;
const hudKeyBox = document.getElementById("keyBox")!;

let score = 0;
let timeLeft = 60;
let gameOver = false;

// 1 = arena, 2 = second room (far in +Z)
let sceneState: 1 | 2 = 1;

// offset for second scene
const SCENE2_Z_OFFSET = 100;

// --------------------------------------------------------
// INVENTORY SYSTEM
// --------------------------------------------------------
const inventory: Record<KeyColor, number> = {
  red: 0,
  green: 0,
  blue: 0,
};
// "red", "green", "blue"

const keyColors = ["red", "green", "blue"];

function keyColorHex(name: string): number {
  return name === "red" ? 0xff0000 : name === "green" ? 0x00ff00 : 0x0000ff; // blue
}

function updateInventoryHUD() {
  hudKeyBox.textContent = `Red: ${inventory.red} | Green: ${inventory.green} | Blue: ${inventory.blue}`;
}
// --------------------------------------------------------
// PHYSICS WORLD
// --------------------------------------------------------
const world = new World({ gravity: new Vec3(0, -20, 0) });

const groundMat = new Material("ground");
const playerMat = new Material("player");
const wallMat = new Material("wall");

world.addContactMaterial(
  new ContactMaterial(groundMat, playerMat, {
    friction: 0.01,
    restitution: 0,
  }),
);

world.addContactMaterial(
  new ContactMaterial(wallMat, playerMat, {
    friction: 0,
    restitution: 0,
  }),
);

// --------------------------------------------------------
// HELPER: BOX CREATOR
// --------------------------------------------------------
function makeBox(
  size: Vec3,
  pos: Vec3,
  mass: number,
  color: number,
  material?: Material,
) {
  const body = new Body({
    mass,
    shape: new CBox(size),
    position: pos.clone(),
    material,
  });
  if (mass === 0) body.type = Body.STATIC;

  world.addBody(body);

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x * 2, size.y * 2, size.z * 2),
    new THREE.MeshStandardMaterial({ color }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // why: avoid any mis-culling when far from origin

  scene.add(mesh);

  return { body, mesh, size };
}

function makeInvisibleWall(size: Vec3, pos: Vec3, material?: Material) {
  const body = new Body({
    mass: 0,
    shape: new CBox(size),
    position: pos.clone(),
    material,
  });
  body.type = Body.STATIC;
  world.addBody(body);

  // no mesh — invisible barrier
  return body;
}

// --------------------------------------------------------
// ARENA TEMPLATE (GROUND + CROSS WALLS + BOUNDARIES)
// --------------------------------------------------------
const WALL_H = 1.2;
const WALL_THICK = 0.4;
const BARRIER_THICK = 0.5;
const BARRIER_SIZE = 20; // matches arena size

// ✨ changed: added optional gridColor
function createArena(offsetZ: number, gridColor?: number) {
  // Ground
  makeBox(
    new Vec3(20, 0.1, 20),
    new Vec3(0, 0.1, offsetZ),
    0,
    0x222244,
    groundMat,
  );

  // Cross walls
  makeBox(
    new Vec3(WALL_THICK, WALL_H, 20),
    new Vec3(0, WALL_H + 0.1, offsetZ),
    0,
    0xaa3344,
    wallMat,
  );

  makeBox(
    new Vec3(20, WALL_H, WALL_THICK),
    new Vec3(0, WALL_H + 0.1, offsetZ),
    0,
    0xaa3344,
    wallMat,
  );

  // Invisible boundaries
  makeInvisibleWall(
    new Vec3(BARRIER_THICK, 5, BARRIER_SIZE),
    new Vec3(-20.5, 5, offsetZ),
    wallMat,
  );
  makeInvisibleWall(
    new Vec3(BARRIER_THICK, 5, BARRIER_SIZE),
    new Vec3(20.5, 5, offsetZ),
    wallMat,
  );
  makeInvisibleWall(
    new Vec3(BARRIER_SIZE, 5, BARRIER_THICK),
    new Vec3(0, 5, offsetZ - 20.5),
    wallMat,
  );
  makeInvisibleWall(
    new Vec3(BARRIER_SIZE, 5, BARRIER_THICK),
    new Vec3(0, 5, offsetZ + 20.5),
    wallMat,
  );

  // Grid helper (colored for scene 2)
  const grid = new THREE.GridHelper(
    40,
    40,
    gridColor ?? 0x444444, // center lines
    gridColor ?? 0x222222, // rest of lines
  );
  grid.position.set(0, 0.001, offsetZ);
  (grid.material as THREE.Material).depthWrite = true;
  scene.add(grid);
}

// Create both arenas: Scene 1 at z=0, Scene 2 at z=SCENE2_Z_OFFSET
createArena(0); // default grid color
createArena(SCENE2_Z_OFFSET, 0x00ffcc); // 💡 bright cyan grid in scene 2

// --------------------------------------------------------
// DOORS (SCENE 1 NORTH WALL → SCENE 2, SCENE 2 SOUTH WALL → SCENE 1)
// --------------------------------------------------------

// Door in Scene 1 at north side (z ≈ +20)
const door1 = makeBox(
  new Vec3(1, 1.8, 0.5),
  new Vec3(15, 0.9, 20),
  0,
  0x8888ff,
  wallMat,
);

// Door in Scene 2 at south side (z ≈ SCENE2_Z_OFFSET - 20)
const door2 = makeBox(
  new Vec3(1, 1.8, 0.5),
  new Vec3(15, 0.9, SCENE2_Z_OFFSET - 20),
  0,
  0xff8888,
  wallMat,
);

function goToScene1() {
  sceneState = 1;
  player.body.velocity.set(0, 0, 0);
  player.body.angularVelocity.set(0, 0, 0);
  player.body.position.set(0, 2, -6);

  hudMsg.style.display = "block";
  hudMsg.textContent = "Back to Scene 1";
  setTimeout(() => (hudMsg.style.display = "none"), 800);
}

function goToScene2() {
  sceneState = 2;
  player.body.velocity.set(0, 0, 0);
  player.body.angularVelocity.set(0, 0, 0);
  player.body.position.set(0, 2, SCENE2_Z_OFFSET);

  hudMsg.style.display = "block";
  hudMsg.textContent = "Entered Scene 2";
  setTimeout(() => (hudMsg.style.display = "none"), 800);
}

// --------------------------------------------------------
// PLAYER CUBE
// --------------------------------------------------------
const PLAYER_SIZE = new Vec3(0.4, 0.4, 0.4);

const player = makeBox(PLAYER_SIZE, new Vec3(0, 2, -6), 1, 0x33ccff, playerMat);

player.body.fixedRotation = true;
player.body.updateMassProperties();
player.body.linearDamping = 0.15;

// --------------------------------------------------------
// KEY SPAWNING (RANDOM SCENE 1 OR 2)
// --------------------------------------------------------
function spawnKey(color: string) {
  const size = new Vec3(0.3, 0.3, 0.3);

  const sceneIndex: 1 | 2 = Math.random() < 0.5 ? 1 : 2;
  const baseZ = sceneIndex === 1 ? 0 : SCENE2_Z_OFFSET;

  const pos = new Vec3(
    THREE.MathUtils.randFloat(-19, 19),
    0.5,
    THREE.MathUtils.randFloat(-19, 19) + baseZ,
  );

  const keyObj = makeBox(size, pos, 0, keyColorHex(color), groundMat);
  return { ...keyObj, color, scene: sceneIndex };
}

let key = spawnKey("red");

// --------------------------------------------------------
// BUTTON (GOAL) — RANDOM SCENE 1 OR 2
// --------------------------------------------------------
function spawnButton() {
  const size = new Vec3(0.7, 0.3, 0.7);

  const colorName = keyColors[Math.floor(Math.random() * keyColors.length)];
  const colorHex = keyColorHex(colorName);

  const sceneIndex: 1 | 2 = Math.random() < 0.5 ? 1 : 2;
  const baseZ = sceneIndex === 1 ? 0 : SCENE2_Z_OFFSET;

  const quadrants = [
    { xMin: -19, xMax: -1, zMin: -19, zMax: -1 },
    { xMin: 1, xMax: 19, zMin: -19, zMax: -1 },
    { xMin: -19, xMax: -1, zMin: 1, zMax: 19 },
    { xMin: 1, xMax: 19, zMin: 1, zMax: 19 },
  ];

  const q = quadrants[Math.floor(Math.random() * quadrants.length)];

  const randX = THREE.MathUtils.randFloat(q.xMin + 1.5, q.xMax - 1.5);
  const randZLocal = THREE.MathUtils.randFloat(q.zMin + 1.5, q.zMax - 1.5);
  const pos = new Vec3(randX, 0.3, randZLocal + baseZ);

  const btn = makeBox(size, pos, 0, colorHex, groundMat);
  (btn.mesh.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(
    colorHex,
  );

  return { ...btn, color: colorName as KeyColor, scene: sceneIndex };
}

let button = spawnButton();
key = spawnKey(keyColors[Math.floor(Math.random() * keyColors.length)]);

// --------------------------------------------------------
// INPUT
// --------------------------------------------------------
const keysPressed: Record<string, boolean> = {};
window.addEventListener(
  "keydown",
  (e) => (keysPressed[e.key.toLowerCase()] = true),
);
window.addEventListener(
  "keyup",
  (e) => (keysPressed[e.key.toLowerCase()] = false),
);

// --------------------------------------------------------
// CLICK TO PICK UP KEY
// --------------------------------------------------------
window.addEventListener("mousedown", (event) => {
  if (!key) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const hits = raycaster.intersectObject(key.mesh, false);

  if (hits.length > 0) {
    inventory[key.color as KeyColor] += 1;
    updateInventoryHUD();

    scene.remove(key.mesh);
    world.removeBody(key.body);
    key = spawnKey(keyColors[Math.floor(Math.random() * keyColors.length)]);
  }
});

// --------------------------------------------------------
// UPDATE LOOP
// --------------------------------------------------------
let last = performance.now() / 1000;
let hitCooldown = 0;

// fixed-step physics for stability
const FIXED_STEP = 1 / 60;
const MAX_SUBSTEPS = 5;

// reusable vectors to reduce GC churn
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const lightPos = new THREE.Vector3();

function update(dt: number) {
  if (gameOver) return;

  timeLeft -= dt;
  if (timeLeft < 0) timeLeft = 0;
  hudTime.textContent = timeLeft.toFixed(1);
  if (timeLeft <= 0) return endGame(false);

  hitCooldown -= dt;

  // movement
  const moveForce = 25;
  const force = new Vec3(0, 0, 0);
  if (keysPressed["w"]) force.z -= moveForce;
  if (keysPressed["s"]) force.z += moveForce;
  if (keysPressed["a"]) force.x -= moveForce;
  if (keysPressed["d"]) force.x += moveForce;
  player.body.applyForce(force, player.body.position);

  // jump
  const onGround = player.body.position.y <= PLAYER_SIZE.y + 0.55;
  if (keysPressed[" "] && onGround) {
    player.body.applyImpulse(new Vec3(0, 1.5, 0), player.body.position);
  }

  // stable physics step (why: avoids jitter “glitchy” feeling)
  world.step(FIXED_STEP, dt, MAX_SUBSTEPS);

  // sync player, button, key, doors
  [player, button, key, door1, door2].forEach((obj) => {
    if (!obj) return;
    obj.mesh.position.copy(obj.body.position as unknown as THREE.Vector3);
    obj.mesh.quaternion.copy(
      obj.body.quaternion as unknown as THREE.Quaternion,
    );
  });

  // BUTTON INTERACTION
  const dist = player.body.position.vsub(button.body.position).length();
  if (dist < 1 && hitCooldown <= 0) {
    hitCooldown = 0.3;
    if (inventory[button.color] <= 0) {
      hudMsg.style.display = "block";
      hudMsg.textContent = "You don't have that key!";
      setTimeout(() => (hudMsg.style.display = "none"), 700);
      return;
    }
    inventory[button.color] -= 1;
    updateInventoryHUD();
    // correct key
    score++;
    hudScore.textContent = String(score);

    button.mesh.scale.set(1, 0.5, 1);
    setTimeout(() => button.mesh.scale.set(1, 1, 1), 120);

    scene.remove(button.mesh);
    world.removeBody(button.body);

    button = spawnButton();

    if (score >= 10) endGame(true);
  }

  // DOOR INTERACTION: SCENE SWITCHING
  const d1 = player.body.position.vsub(door1.body.position).length();
  if (sceneState === 1 && d1 < 1.5) {
    goToScene2();
  }
  const d2 = player.body.position.vsub(door2.body.position).length();
  if (sceneState === 2 && d2 < 1.5) {
    goToScene1();
  }

  // camera follow
  camPos.set(
    player.body.position.x,
    player.body.position.y + 12,
    player.body.position.z + 10,
  );
  camera.position.lerp(camPos, 0.12);
  camTarget.set(
    player.body.position.x,
    player.body.position.y,
    player.body.position.z,
  );
  camera.lookAt(camTarget);

  // keep the light near the player (why: consistent lighting in both scenes)
  lightPos.set(
    player.body.position.x + 8,
    player.body.position.y + 15,
    player.body.position.z + 6,
  );
  dirLight.position.lerp(lightPos, 0.2);
}

function endGame(win: boolean) {
  gameOver = true;
  hudMsg.style.display = "block";
  hudMsg.textContent = win ? "MISSION COMPLETE!" : "MISSION FAILED";
}

// --------------------------------------------------------
function loop() {
  const now = performance.now() / 1000;
  update(now - last);
  last = now;

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
