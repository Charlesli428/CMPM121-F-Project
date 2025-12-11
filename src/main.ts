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

// --------------------------------------------------------
// SCENE + CAMERA + RENDERER
// --------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020416);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(10, 12, 14);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
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

// --------------------------------------------------------
// INVENTORY SYSTEM
// --------------------------------------------------------
let heldKey: string | null = null; // "red", "green", "blue"

const keyColors = ["red", "green", "blue"];

function keyColorHex(name: string): number {
  return name === "red" ? 0xff0000 : name === "green" ? 0x00ff00 : 0x0000ff; // blue
}

function updateKeyBox() {
  if (!heldKey) {
    (hudKeyBox as HTMLElement).style.background = "transparent";
    return;
  }
  hudKeyBox.style.background =
    "#" + keyColorHex(heldKey).toString(16).padStart(6, "0");
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

  scene.add(mesh);

  return { body, mesh, size };
}

// --------------------------------------------------------
// GROUND
// --------------------------------------------------------
makeBox(new Vec3(20, 0.1, 20), new Vec3(0, 0.1, 0), 0, 0x222244, groundMat);

// --------------------------------------------------------
// CROSS WALLS
// --------------------------------------------------------
const WALL_H = 1.2;
const WALL_THICK = 0.4;

makeBox(
  new Vec3(WALL_THICK, WALL_H, 20),
  new Vec3(0, WALL_H + 0.1, 0),
  0,
  0xaa3344,
  wallMat,
);

makeBox(
  new Vec3(20, WALL_H, WALL_THICK),
  new Vec3(0, WALL_H + 0.1, 0),
  0,
  0xaa3344,
  wallMat,
);

// --------------------------------------------------------
// PLAYER CUBE
// --------------------------------------------------------
const PLAYER_SIZE = new Vec3(0.4, 0.4, 0.4);

const player = makeBox(PLAYER_SIZE, new Vec3(0, 2, -6), 1, 0x33ccff, playerMat);

player.body.fixedRotation = true;
player.body.updateMassProperties();
player.body.linearDamping = 0.15;

// --------------------------------------------------------
// KEY SPAWNING
// --------------------------------------------------------
function spawnKey(color: string) {
  const size = new Vec3(0.3, 0.3, 0.3);

  const pos = new Vec3(
    THREE.MathUtils.randFloat(-19, 19),
    0.5,
    THREE.MathUtils.randFloat(-19, 19),
  );

  const keyObj = makeBox(size, pos, 0, keyColorHex(color), groundMat);
  return { ...keyObj, color };
}

let key = spawnKey("red");

// --------------------------------------------------------
// BUTTON (GOAL)
// --------------------------------------------------------
function spawnButton() {
  const size = new Vec3(0.7, 0.3, 0.7);

  const colorName = keyColors[Math.floor(Math.random() * keyColors.length)];
  const colorHex = keyColorHex(colorName);

  const quadrants = [
    { xMin: -19, xMax: -1, zMin: -19, zMax: -1 },
    { xMin: 1, xMax: 19, zMin: -19, zMax: -1 },
    { xMin: -19, xMax: -1, zMin: 1, zMax: 19 },
    { xMin: 1, xMax: 19, zMin: 1, zMax: 19 },
  ];

  const q = quadrants[Math.floor(Math.random() * quadrants.length)];

  const randX = THREE.MathUtils.randFloat(q.xMin + 1.5, q.xMax - 1.5);
  const randZ = THREE.MathUtils.randFloat(q.zMin + 1.5, q.zMax - 1.5);

  const pos = new Vec3(randX, 0.3, randZ);

  const btn = makeBox(size, pos, 0, colorHex, groundMat);
  (btn.mesh.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(
    colorHex,
  );

  return { ...btn, color: colorName };
}

let button = spawnButton();
key = spawnKey(button.color); // initial key matches first button

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
// UPDATE LOOP
// --------------------------------------------------------
let last = performance.now() / 1000;
let hitCooldown = 0;

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

  world.step(1 / 60, dt);

  // sync player and button meshes
  [player, button, key].forEach((obj) => {
    obj.mesh.position.copy(obj.body.position);
    obj.mesh.quaternion.copy(obj.body.quaternion);
  });

  // KEY PICKUP
  const keyDist = player.body.position.vsub(key.body.position).length();
  if (keyDist < 1) {
    heldKey = key.color;
    updateKeyBox();

    scene.remove(key.mesh);
    world.removeBody(key.body);
  }

  // BUTTON INTERACTION
  const dist = player.body.position.vsub(button.body.position).length();
  if (dist < 1 && hitCooldown <= 0) {
    hitCooldown = 0.3;

    if (heldKey !== button.color) {
      hudMsg.style.display = "block";
      hudMsg.textContent = "WRONG KEY!";
      setTimeout(() => (hudMsg.style.display = "none"), 700);
      return;
    }

    // correct key
    score++;
    hudScore.textContent = String(score);

    button.mesh.scale.set(1, 0.5, 1);
    setTimeout(() => button.mesh.scale.set(1, 1, 1), 120);

    scene.remove(button.mesh);
    world.removeBody(button.body);

    heldKey = null;
    updateKeyBox();

    button = spawnButton();
    key = spawnKey(button.color);

    if (score >= 10) endGame(true);
  }

  // camera
  camera.position.lerp(
    new THREE.Vector3(
      player.body.position.x,
      player.body.position.y + 12,
      player.body.position.z + 10,
    ),
    0.12,
  );
  camera.lookAt(
    new THREE.Vector3(
      player.body.position.x,
      player.body.position.y,
      player.body.position.z,
    ),
  );
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
