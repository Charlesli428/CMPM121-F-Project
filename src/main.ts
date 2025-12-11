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

let score = 0;
let timeLeft = 30;
let gameOver = false;

// --------------------------------------------------------
// PHYSICS WORLD
// --------------------------------------------------------
const world = new World({ gravity: new Vec3(0, -20, 0) });

const groundMat = new Material("ground");
const playerMat = new Material("player");
const wallMat = new Material("wall");

// ground ↔ player friction
world.addContactMaterial(
  new ContactMaterial(groundMat, playerMat, {
    friction: 0.01,
    restitution: 0,
  }),
);

// wall ↔ player friction FIX (makes sliding smooth)
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

// vertical
makeBox(
  new Vec3(WALL_THICK, WALL_H, 20),
  new Vec3(0, WALL_H + 0.1, 0),
  0,
  0xaa3344,
  wallMat,
);

// horizontal
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
// BUTTON (GOAL)
// --------------------------------------------------------
let button = spawnButton();

// Spawn function
function spawnButton() {
  const size = new Vec3(0.7, 0.3, 0.7);

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

  const btn = makeBox(size, pos, 0, 0xff3366, groundMat);

  (btn.mesh.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(
    0xff3366,
  );

  return btn;
}

// --------------------------------------------------------
// INPUT
// --------------------------------------------------------
const keys: Record<string, boolean> = {};
window.addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = true));
window.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

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

  if (timeLeft <= 0 && !gameOver) return endGame(false);

  hitCooldown -= dt;

  const moveForce = 25;
  const force = new Vec3(0, 0, 0);

  if (keys["w"]) force.z -= moveForce;
  if (keys["s"]) force.z += moveForce;
  if (keys["a"]) force.x -= moveForce;
  if (keys["d"]) force.x += moveForce;

  player.body.applyForce(force, player.body.position);

  const onGround = player.body.position.y <= PLAYER_SIZE.y + 0.55;
  if (keys[" "] && onGround) {
    player.body.applyImpulse(new Vec3(0, 1.5, 0), player.body.position);
  }

  world.step(1 / 60, dt);

  [player, button].forEach((obj) => {
    obj.mesh.position.copy(obj.body.position);
    obj.mesh.quaternion.copy(obj.body.quaternion);
  });

  const dist = player.body.position.vsub(button.body.position).length();
  if (dist < 1 && hitCooldown <= 0) {
    hitCooldown = 0.3;
    score++;
    hudScore.textContent = String(score);

    button.mesh.scale.set(1, 0.5, 1);
    setTimeout(() => {
      button.mesh.scale.set(1, 1, 1);
    }, 120);

    scene.remove(button.mesh);
    world.removeBody(button.body);

    button = spawnButton();

    if (score >= 10) endGame(true);
  }

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
