import "../mobile-fixes.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { World } from "./world";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { createUI } from "./ui";
import { Player } from "./player";
import { Physics } from "./physics";
import { blocks } from "./blocks";
import { ModelLoader } from "./modelLoader";
import { MultiplayerClient } from "./multiplayer";
import { MobileControls } from "./mobileControls";
import { ActionMenu } from "./actionMenu";

const stats = new Stats();
document.body.append(stats.dom);

// Renderer
const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x80a0e0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Camera
const orbitCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight);
orbitCamera.position.set(32, 32, 24);
orbitCamera.layers.enable(1);

const controls = new OrbitControls(orbitCamera, renderer.domElement);
controls.target.set(16, 0, 16);
controls.update();

// Scene
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x80a0e0, 50, 100);
const world = new World();
world.generate();
scene.add(world);

const player = new Player(scene);
const physics = new Physics(scene);
const multiplayer = new MultiplayerClient({ scene, world, player });

const modelLoader = new ModelLoader();
modelLoader.loadModels((models) => {
    player.tool.setMesh(models.pickaxe);
});

const sun = new THREE.DirectionalLight();

function setupLights() {
    sun.position.set(50, 50, 50);
    sun.castShadow = true;
    // sun.intensity = 1.5;
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.bottom = -100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 200;
    sun.shadow.bias = -0.0001;

    sun.shadow.mapSize = new THREE.Vector2(2048, 2048);
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene.add(sun);
    scene.add(sun.target);

    const ambient = new THREE.AmbientLight();
    ambient.intensity = 0.25;
    scene.add(ambient);
}

function tryInteract() {
    if (!player.isControlling || !player.selectedCoords) return;

    const coords = player.selectedCoords.clone();
    const selectedBlock = world.getBlock(coords.x, coords.y, coords.z);
    const previousBlockId = selectedBlock?.id ?? blocks.empty.id;

    if (player.activeBlockId === blocks.empty.id) {
        if (!selectedBlock || selectedBlock.id === blocks.empty.id) return;

        world.removeBlock(coords.x, coords.y, coords.z);
        player.tool.startAnimation();
        multiplayer.sendBlockChange(coords, blocks.empty.id, previousBlockId);
        multiplayer.sendInteraction('mine');
    } else {
        if (!selectedBlock || selectedBlock.id !== blocks.empty.id) return;

        world.addBlock(coords.x, coords.y, coords.z, player.activeBlockId);
        multiplayer.sendBlockChange(coords, player.activeBlockId, previousBlockId);
        multiplayer.sendInteraction('place');
    }
}

function onMouseDown(event) {
    if (event.target?.closest?.('#chat') || event.target?.closest?.('#mobile-controls') || event.target?.closest?.('#action-menu')) return;
    tryInteract();
}

document.addEventListener('mousedown', onMouseDown);

new MobileControls({
    player,
    onAction: tryInteract,
    onChat: () => multiplayer.openChat()
});

new ActionMenu({ player, multiplayer });

// Render loop
let previousTime = performance.now();
function animate() {
    let currentTime = performance.now();
    let dt = (currentTime - previousTime) / 1000;

    requestAnimationFrame(animate);

    if (player.isControlling) {
        player.update(world);
        physics.update(dt, player, world);
        world.update(player);

        sun.position.copy(player.position);
        sun.position.sub(new THREE.Vector3(-50, -50, -50));
        sun.target.position.copy(player.position);
    }

    multiplayer.update(dt);

    renderer.render(scene, player.isControlling ? player.camera : orbitCamera);
    stats.update();

    previousTime = currentTime;
}

window.addEventListener("resize", () => {
    orbitCamera.aspect = window.innerWidth / window.innerHeight;
    orbitCamera.updateProjectionMatrix();
    player.camera.aspect = window.innerWidth / window.innerHeight;
    player.camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
})

setupLights();
createUI(scene, world, player, multiplayer);
animate();
