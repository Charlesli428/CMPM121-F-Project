// src/main.ts
import * as THREE from "three";
import {
  World,
  Body,
  Sphere as CSphere,
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
  65,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);

// third-person follow start position
camera.position.set(0, 5, 12);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.innerHTML = "";
document.body.appendChild(renderer.domElement);

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(4, 10, 6);
scene.add(dirLight);

// --------------------------------------------------------
// PHYSICS WORLD
// --------------------------------------------------------
const world = new World({
  gravity: new Vec3(0, -9, 0),
});

const groundMat = new Material("ground");
const ballMat = new Material("ball");

world.addContactMaterial(
  new ContactMaterial(groundMat, ballMat, {
    friction: 0.8,
    restitution: 0.1,
  }),
);

// --------------------------------------------------------
// HELPER: create box
// --------------------------------------------------------
function createBox(
  size: Vec3,
  position: Vec3,
  mass: number,
  color: number,
  material?: Material,
) {
  const shape = new CBox(size);
  const body = new Body({ mass, shape, position, material });
  if (mass === 0) body.type = Body.STATIC;
  world.addBody(body);

  const geo = new THREE.BoxGeometry(size.x * 2, size.y * 2, size.z * 2);
  const mat = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  return { body, mesh };
}

// --------------------------------------------------------
// GROUND PLATFORM
// --------------------------------------------------------
const ground = createBox(
  new Vec3(10, 0.5, 10),
  new Vec3(0, -0.5, 0),
  0,
  0x222244,
  groundMat,
);

// --------------------------------------------------------
// BALL PLAYER
// --------------------------------------------------------
const BALL_RADIUS = 0.5;

const ballBody = new Body({
  mass: 1,
  shape: new CSphere(BALL_RADIUS),
  position: new Vec3(0, 1, 0),
  material: ballMat,
});
ballBody.linearDamping = 0.2;
ballBody.angularDamping = 0.3;
world.addBody(ballBody);

const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_RADIUS, 32, 16),
  new THREE.MeshStandardMaterial({
    color: 0x33ccff,
    emissive: 0x113344,
  }),
);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
scene.add(ballMesh);

// --------------------------------------------------------
// BUTTON (goal)
// --------------------------------------------------------
const button = createBox(
  new Vec3(0.4, 0.2, 0.4),
  new Vec3(-3, 0.2, -3),
  0,
  0xff3366,
  groundMat,
);
(button.mesh.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(
  0xff3366,
);

// --------------------------------------------------------
// INPUT
// --------------------------------------------------------
const keys: Record<string, boolean> = {};
window.addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = true));
window.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

// --------------------------------------------------------
// UPDATE LOOP
// --------------------------------------------------------
let lastTime = performance.now() / 1000;

function update(dt: number) {
  // ----------------------------------------------------
  // CAMERA-RELATIVE MOVEMENT
  // ----------------------------------------------------
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3();
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const move = new THREE.Vector3();
  if (keys["w"]) move.add(forward);
  if (keys["s"]) move.sub(forward);
  if (keys["d"]) move.add(right);
  if (keys["a"]) move.sub(right);

  if (move.lengthSq() > 0) {
    move.normalize();
    const moveForce = 22;
    ballBody.applyForce(
      new Vec3(move.x * moveForce, 0, move.z * moveForce),
      ballBody.position,
    );
  }

  // ----------------------------------------------------
  // PLATFORM BOUNDARY
  // ----------------------------------------------------
  const LIMIT = 9;
  if (ballBody.position.x > LIMIT) {
    ballBody.position.x = LIMIT;
    ballBody.velocity.x *= -0.3;
  }
  if (ballBody.position.x < -LIMIT) {
    ballBody.position.x = -LIMIT;
    ballBody.velocity.x *= -0.3;
  }
  if (ballBody.position.z > LIMIT) {
    ballBody.position.z = LIMIT;
    ballBody.velocity.z *= -0.3;
  }
  if (ballBody.position.z < -LIMIT) {
    ballBody.position.z = -LIMIT;
    ballBody.velocity.z *= -0.3;
  }

  // ----------------------------------------------------
  // PHYSICS STEP
  // ----------------------------------------------------
  world.step(1 / 60, dt);

  // ----------------------------------------------------
  // SYNC MESHES
  // ----------------------------------------------------
  ballMesh.position.copy(ballBody.position);
  ballMesh.quaternion.copy(ballBody.quaternion);

  ground.mesh.position.copy(ground.body.position);
  ground.mesh.quaternion.copy(ground.body.quaternion);

  button.mesh.position.copy(button.body.position);
  button.mesh.quaternion.copy(button.body.quaternion);

  // ----------------------------------------------------
  // THIRD-PERSON FOLLOW CAMERA 🔥🔥🔥
  // ----------------------------------------------------
  const camTarget = new THREE.Vector3(
    ballBody.position.x,
    ballBody.position.y + 3.5, // height above ball
    ballBody.position.z + 8, // behind ball
  );

  // smooth camera motion
  camera.position.lerp(camTarget, 0.08);

  // always look at the ball
  camera.lookAt(ballBody.position.x, ballBody.position.y, ballBody.position.z);
}

function loop() {
  const now = performance.now() / 1000;
  const dt = now - lastTime;
  lastTime = now;

  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

loop();

// --------------------------------------------------------
// RESIZE HANDLER
// --------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
