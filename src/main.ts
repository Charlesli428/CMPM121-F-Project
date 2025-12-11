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
camera.position.set(10, 10, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.innerHTML = "";
document.body.appendChild(renderer.domElement);

// lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(8, 15, 6);
scene.add(dirLight);

// --------------------------------------------------------
// PHYSICS WORLD
// --------------------------------------------------------
const world = new World({
  gravity: new Vec3(0, -9.82, 0),
});

const groundMat = new Material("ground");
const playerMat = new Material("player");

world.addContactMaterial(
  new ContactMaterial(groundMat, playerMat, {
    friction: 0.012,
    restitution: 0,
  }),
);

// --------------------------------------------------------
// HELPER: MAKE BOX
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
    position: pos,
    material,
  });

  if (mass === 0) body.type = Body.STATIC;
  world.addBody(body);

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x * 2, size.y * 2, size.z * 2),
    new THREE.MeshStandardMaterial({ color }),
  );

  scene.add(mesh);
  return { body, mesh };
}

// --------------------------------------------------------
// GROUND
// --------------------------------------------------------
makeBox(new Vec3(20, 0.1, 20), new Vec3(0, 0.1, 0), 0, 0x222244, groundMat);

// --------------------------------------------------------
// BUTTON (PLACE OUTSIDE CENTER)
// --------------------------------------------------------
const button = makeBox(
  new Vec3(0.7, 0.3, 0.7),
  new Vec3(-7, 0.35, 7), // WORKS NOW
  0,
  0xff3366,
  groundMat,
);

// glow
(button.mesh.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(
  0xff3366,
);

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
);
makeBox(
  new Vec3(20, WALL_H, WALL_THICK),
  new Vec3(0, WALL_H + 0.1, 0),
  0,
  0xaa3344,
);

// --------------------------------------------------------
// PLAYER
// --------------------------------------------------------
const PLAYER_SIZE = new Vec3(0.4, 0.4, 0.4);

const playerBody = new Body({
  mass: 1,
  shape: new CBox(PLAYER_SIZE),
  position: new Vec3(0, 2, -6),
  material: playerMat,
});
playerBody.fixedRotation = true;
playerBody.updateMassProperties();
playerBody.linearDamping = 0.15;

world.addBody(playerBody);

const playerMesh = new THREE.Mesh(
  new THREE.BoxGeometry(
    PLAYER_SIZE.x * 2,
    PLAYER_SIZE.y * 2,
    PLAYER_SIZE.z * 2,
  ),
  new THREE.MeshStandardMaterial({ color: 0x33ccff }),
);
scene.add(playerMesh);

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

function update(dt: number) {
  const moveForce = 25;

  // Movement
  const force = new Vec3(0, 0, 0);
  if (keys["w"]) force.z -= moveForce;
  if (keys["s"]) force.z += moveForce;
  if (keys["a"]) force.x -= moveForce;
  if (keys["d"]) force.x += moveForce;

  playerBody.applyForce(force, playerBody.position);

  // Jump
  const onGround = playerBody.position.y <= PLAYER_SIZE.y + 0.55;
  if (keys[" "] && onGround) {
    playerBody.applyImpulse(new Vec3(0, 1.5, 0), playerBody.position);
  }

  world.step(1 / 60, dt);

  // SYNC PLAYER
  playerMesh.position.copy(playerBody.position);
  playerMesh.quaternion.copy(playerBody.quaternion);

  // SYNC BUTTON (THIS WAS MISSING BEFORE)
  button.mesh.position.copy(button.body.position);
  button.mesh.quaternion.copy(button.body.quaternion);

  // CAMERA FOLLOW
  const camTarget = new THREE.Vector3(
    playerBody.position.x,
    playerBody.position.y + 12,
    playerBody.position.z + 10,
  );
  camera.position.lerp(camTarget, 0.12);
  camera.lookAt(
    playerBody.position.x,
    playerBody.position.y + 1,
    playerBody.position.z,
  );
}

function loop() {
  const now = performance.now() / 1000;
  update(now - last);
  last = now;

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

loop();

// --------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
