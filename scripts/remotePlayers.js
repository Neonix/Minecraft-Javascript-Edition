import * as THREE from 'three';
import { blocks } from './blocks';

const bodyGeometry = new THREE.BoxGeometry(0.75, 1.1, 0.35);
const headGeometry = new THREE.BoxGeometry(0.55, 0.55, 0.55);
const limbGeometry = new THREE.BoxGeometry(0.22, 0.85, 0.22);
const heldBlockGeometry = new THREE.BoxGeometry(0.28, 0.28, 0.28);

const blockById = Object.fromEntries(Object.values(blocks).map((block) => [block.id, block]));

function makeNameTexture(name, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;

    const ctx = canvas.getContext('2d');
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 20, canvas.width, 88);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 28, canvas.width - 16, 72);
    ctx.fillStyle = color || '#ffffff';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 2, canvas.width - 40);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

function createMaterial(color, lightness = 1) {
    const baseColor = new THREE.Color(color || '#4f8cff');
    baseColor.multiplyScalar(lightness);
    return new THREE.MeshLambertMaterial({ color: baseColor });
}

export class RemotePlayer {
    constructor(id, state) {
        this.id = id;
        this.state = state;
        this.targetPosition = new THREE.Vector3();
        this.targetRotationY = 0;
        this.lastInteractionAt = 0;

        this.group = new THREE.Group();
        this.group.name = `remote-player-${id}`;

        this.body = new THREE.Mesh(bodyGeometry, createMaterial(state.color, 0.9));
        this.body.position.set(0, -0.7, 0);
        this.group.add(this.body);

        this.head = new THREE.Mesh(headGeometry, createMaterial(state.color, 1.2));
        this.head.position.set(0, 0.1, 0);
        this.group.add(this.head);

        this.leftArm = new THREE.Mesh(limbGeometry, createMaterial(state.color, 0.7));
        this.leftArm.position.set(-0.52, -0.7, 0);
        this.group.add(this.leftArm);

        this.rightArm = new THREE.Mesh(limbGeometry, createMaterial(state.color, 0.7));
        this.rightArm.position.set(0.52, -0.7, 0);
        this.group.add(this.rightArm);

        this.leftLeg = new THREE.Mesh(limbGeometry, createMaterial(state.color, 0.55));
        this.leftLeg.position.set(-0.22, -1.6, 0);
        this.group.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(limbGeometry, createMaterial(state.color, 0.55));
        this.rightLeg.position.set(0.22, -1.6, 0);
        this.group.add(this.rightLeg);

        this.heldBlock = new THREE.Mesh(heldBlockGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff }));
        this.heldBlock.position.set(0.67, -0.28, -0.24);
        this.heldBlock.visible = false;
        this.group.add(this.heldBlock);

        this.nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: makeNameTexture(state.nickname, state.color),
            transparent: true,
            depthTest: false,
            depthWrite: false
        }));
        this.nameSprite.position.set(0, 0.95, 0);
        this.nameSprite.scale.set(2.6, 0.65, 1);
        this.nameSprite.renderOrder = 999;
        this.group.add(this.nameSprite);

        this.applyState(state, true);
    }

    applyState(state, instant = false) {
        this.state = { ...this.state, ...state };
        const { position, rotation } = this.state;

        this.targetPosition.set(position.x, position.y, position.z);
        this.targetRotationY = rotation.y || 0;
        this.updateHeldBlock();

        if (instant) {
            this.group.position.copy(this.targetPosition);
            this.group.rotation.y = this.targetRotationY;
        }
    }

    updateHeldBlock() {
        const block = blockById[this.state.activeBlockId];
        if (!block || block.id === blocks.empty.id) {
            this.heldBlock.visible = false;
            return;
        }

        this.heldBlock.material = Array.isArray(block.material) ? block.material[0] : block.material;
        this.heldBlock.visible = true;
    }

    triggerInteraction(type) {
        this.lastInteractionAt = performance.now();
        this.interactionType = type;
    }

    update(dt) {
        const smoothing = Math.min(1, dt * 12);
        this.group.position.lerp(this.targetPosition, smoothing);
        this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, this.targetRotationY, smoothing);

        const walking = this.state.sprinting ? 10 : 6;
        const walkPhase = performance.now() * 0.001 * walking;
        const walkAmount = this.state.onGround ? 0.22 : 0.05;
        this.leftLeg.rotation.x = Math.sin(walkPhase) * walkAmount;
        this.rightLeg.rotation.x = -Math.sin(walkPhase) * walkAmount;
        this.leftArm.rotation.x = -Math.sin(walkPhase) * walkAmount * 0.7;

        const elapsedInteraction = performance.now() - this.lastInteractionAt;
        if (elapsedInteraction < 450) {
            const swing = Math.sin((elapsedInteraction / 450) * Math.PI);
            this.rightArm.rotation.x = -1.2 * swing;
            this.heldBlock.rotation.x += dt * 8;
            this.heldBlock.rotation.y += dt * 6;
        } else {
            this.rightArm.rotation.x = Math.sin(walkPhase) * walkAmount * 0.7;
            this.heldBlock.rotation.set(0, 0, 0);
        }

        if (this.interactionType === 'wave' && elapsedInteraction < 900) {
            this.rightArm.rotation.z = -1.2 + Math.sin(performance.now() * 0.02) * 0.35;
        } else {
            this.rightArm.rotation.z = 0;
        }
    }

    dispose() {
        this.nameSprite.material.map.dispose();
        this.nameSprite.material.dispose();
        this.group.removeFromParent();
    }
}

export class RemotePlayers {
    constructor(scene) {
        this.scene = scene;
        this.players = new Map();
    }

    sync(playersSnapshot, localPlayerId) {
        const ids = new Set(Object.keys(playersSnapshot || {}));

        for (const id of this.players.keys()) {
            if (!ids.has(id)) {
                this.remove(id);
            }
        }

        Object.entries(playersSnapshot || {}).forEach(([id, state]) => {
            if (id !== localPlayerId) {
                this.upsert(id, state, true);
            }
        });
    }

    upsert(id, state, instant = false) {
        let remotePlayer = this.players.get(id);
        if (!remotePlayer) {
            remotePlayer = new RemotePlayer(id, state);
            this.players.set(id, remotePlayer);
            this.scene.add(remotePlayer.group);
            return;
        }

        remotePlayer.applyState(state, instant);
    }

    triggerInteraction(id, type) {
        this.players.get(id)?.triggerInteraction(type);
    }

    remove(id) {
        const remotePlayer = this.players.get(id);
        if (!remotePlayer) return;

        remotePlayer.dispose();
        this.players.delete(id);
    }

    update(dt) {
        this.players.forEach((remotePlayer) => remotePlayer.update(dt));
    }
}
