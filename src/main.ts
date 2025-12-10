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
// SCENE + RENDERER + CAMERA
// --------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020416);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.innerHTML = ""; // clear Vite template content
document.body.appendChild(renderer.domElement);

// Lights
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(4, 8, 2);
scene.add(dirLight);

// --------------------------------------------------------
// PHYSICS WORLD
// --------------------------------------------------------
const world = new World({
  gravity: new Vec3(0, -9, 0),
});

const groundMat = new Material("ground");
const ballMat = new Material("ball");

const groundBallContact = new ContactMaterial(groundMat, ballMat, {
  friction: 0.8, // higher friction so the ball rolls instead of sliding
  restitution: 0.1,
});
world.addContactMaterial(groundBallContact);

// Small helper for box bodies + meshes
function createBox(
  size: Vec3,
  position: Vec3,
  mass: number,
  color: number,
  material?: Material,
) {
  const shape = new CBox(size);
  const body = new Body({
    mass,
    shape,
    position,
    material,
  });

  if (mass === 0) {
    body.type = Body.STATIC; // immovable
  }

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
// GROUND (no visible walls; just a flat arena)
// --------------------------------------------------------
const groundSize = new Vec3(10, 0.5, 10);
const ground = createBox(
  groundSize,
  new Vec3(0, -0.5, 0),
  0,
  0x222244,
  groundMat,
);

// --------------------------------------------------------
// BALL PLAYER
// --------------------------------------------------------
const BALL_RADIUS = 0.5;

const ballShape = new CSphere(BALL_RADIUS);
const ballBody = new Body({
  mass: 1,
  shape: ballShape,
  position: new Vec3(0, 1, 0),
  material: ballMat,
});
ballBody.linearDamping = 0.1;
ballBody.angularDamping = 0.2;
world.addBody(ballBody);

const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 16);
const ballMatMesh = new THREE.MeshStandardMaterial({
  color: 0x33ccff,
  emissive: 0x113344,
});
const ballMesh = new THREE.Mesh(ballGeo, ballMatMesh);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
scene.add(ballMesh);

// --------------------------------------------------------
// SIMPLE BUTTON (cube you can roll into; no fancy logic yet)
// --------------------------------------------------------
const buttonSize = new Vec3(0.4, 0.2, 0.4);
const buttonPos = new Vec3(-3, 0.2, -3);

const button = createBox(buttonSize, buttonPos, 0, 0xff3366, groundMat);

// make it glow a bit
(button.mesh.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(
  0xff3366,
);

// --------------------------------------------------------
// INPUT
// --------------------------------------------------------
const keys: Record<string, boolean> = {};

window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
});

window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

// --------------------------------------------------------
// UPDATE LOOP
// --------------------------------------------------------
let lastTime = performance.now() / 1000;

function update(dt: number) {
  // Apply forces for movement (this causes spinning/rolling)
  const moveForce = 15;
  const force = new Vec3(0, 0, 0);

  if (keys["w"]) force.z -= moveForce;
  if (keys["s"]) force.z += moveForce;
  if (keys["a"]) force.x -= moveForce;
  if (keys["d"]) force.x += moveForce;

  if (force.lengthSquared() > 0) {
    // apply at the center; friction with the ground will make it roll
    ballBody.applyForce(force, ballBody.position);
  }

  // Keep ball on our arena: simple invisible border clamp
  const LIMIT = 9;
  if (ballBody.position.x > LIMIT) {
    ballBody.position.x = LIMIT;
    ballBody.velocity.x *= -0.3;
  } else if (ballBody.position.x < -LIMIT) {
    ballBody.position.x = -LIMIT;
    ballBody.velocity.x *= -0.3;
  }

  if (ballBody.position.z > LIMIT) {
    ballBody.position.z = LIMIT;
    ballBody.velocity.z *= -0.3;
  } else if (ballBody.position.z < -LIMIT) {
    ballBody.position.z = -LIMIT;
    ballBody.velocity.z *= -0.3;
  }

  // Step physics
  world.step(1 / 60, dt);

  // Sync meshes
  ballMesh.position.set(
    ballBody.position.x,
    ballBody.position.y,
    ballBody.position.z,
  );
  ballMesh.quaternion.set(
    ballBody.quaternion.x,
    ballBody.quaternion.y,
    ballBody.quaternion.z,
    ballBody.quaternion.w,
  );

  ground.mesh.position.set(
    ground.body.position.x,
    ground.body.position.y,
    ground.body.position.z,
  );
  ground.mesh.quaternion.set(
    ground.body.quaternion.x,
    ground.body.quaternion.y,
    ground.body.quaternion.z,
    ground.body.quaternion.w,
  );

  button.mesh.position.set(
    button.body.position.x,
    button.body.position.y,
    button.body.position.z,
  );
  button.mesh.quaternion.set(
    button.body.quaternion.x,
    button.body.quaternion.y,
    button.body.quaternion.z,
    button.body.quaternion.w,
  );

  // Chase camera: smoothly follow behind and above the ball
  const targetCamPos = new THREE.Vector3(
    ballBody.position.x + 4,
    ballBody.position.y + 3,
    ballBody.position.z + 6,
  );
  camera.position.lerp(targetCamPos, 0.1);
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
