import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import {
    canBuildAt,
    gameState,
    getDataStoreKey,
    getOrCreateProfile,
    loadWorldState,
    publicMeta,
    saveWorldState,
    scheduleSave,
    slugify,
    updateProfileFromBlock
} from './server/gameState.js';
import { handleChatCommand, sendProfile, sendSystemMessage } from './server/chatCommands.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MAX_CHAT_LENGTH = 180;
const VALID_BLOCK_IDS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]);
const SAVE_INTERVAL_MS = 15_000;
const WORLD_EVENT_INTERVAL_MS = 180_000;

const app = express();
const httpServer = createHttpServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*'
    }
});

const players = new Map();

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function sanitizeNickname(nickname) {
    const cleaned = String(nickname || '')
        .replace(/[^\p{L}\p{N}_\- ]/gu, '')
        .trim()
        .slice(0, 18);
    return cleaned || `Player-${Math.floor(Math.random() * 9999)}`;
}

function sanitizeColor(color) {
    const value = String(color || '').trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : '#4f8cff';
}

function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function sanitizePlayerState(rawState = {}) {
    const position = rawState.position || {};
    const rotation = rawState.rotation || {};

    return {
        clientId: slugify(rawState.clientId || rawState.nickname, 'client'),
        nickname: sanitizeNickname(rawState.nickname),
        color: sanitizeColor(rawState.color),
        position: {
            x: clamp(safeNumber(position.x, 32), -100000, 100000),
            y: clamp(safeNumber(position.y, 16), -128, 512),
            z: clamp(safeNumber(position.z, 32), -100000, 100000)
        },
        rotation: {
            x: clamp(safeNumber(rotation.x), -Math.PI, Math.PI),
            y: clamp(safeNumber(rotation.y), -Math.PI * 2, Math.PI * 2),
            z: clamp(safeNumber(rotation.z), -Math.PI, Math.PI)
        },
        activeBlockId: VALID_BLOCK_IDS.has(Number(rawState.activeBlockId)) ? Number(rawState.activeBlockId) : 0,
        sprinting: Boolean(rawState.sprinting),
        onGround: Boolean(rawState.onGround),
        updatedAt: Date.now()
    };
}

function sanitizeWorldParams(params) {
    if (!params || typeof params !== 'object') return null;

    return {
        seed: clamp(safeNumber(params.seed), 0, 1000000),
        terrain: {
            scale: clamp(safeNumber(params.terrain?.scale, 80), 1, 500),
            magnitude: clamp(safeNumber(params.terrain?.magnitude, 10), 0, 128),
            offset: clamp(safeNumber(params.terrain?.offset, 4), 0, 128),
            waterOffset: clamp(safeNumber(params.terrain?.waterOffset, 4), 0, 128)
        },
        trees: {
            trunk: {
                minHeight: clamp(safeNumber(params.trees?.trunk?.minHeight, 4), 0, 32),
                maxHeight: clamp(safeNumber(params.trees?.trunk?.maxHeight, 7), 0, 32)
            },
            canopy: {
                minRadius: clamp(safeNumber(params.trees?.canopy?.minRadius, 3), 0, 16),
                maxRadius: clamp(safeNumber(params.trees?.canopy?.maxRadius, 3), 0, 16),
                density: clamp(safeNumber(params.trees?.canopy?.density, 0.7), 0, 1)
            },
            frequency: clamp(safeNumber(params.trees?.frequency, 0.004), 0, 1)
        },
        clouds: {
            scale: clamp(safeNumber(params.clouds?.scale, 30), 1, 500),
            density: clamp(safeNumber(params.clouds?.density, 0.2), 0, 1)
        }
    };
}

function normalizeBlockChange(payload = {}) {
    const blockId = Number(payload.blockId);
    const previousBlockId = Number(payload.previousBlockId);
    const x = Math.round(safeNumber(payload.x));
    const y = Math.round(safeNumber(payload.y));
    const z = Math.round(safeNumber(payload.z));

    if (!VALID_BLOCK_IDS.has(blockId)) return null;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    if (y < 0 || y > 255) return null;

    return {
        x,
        y,
        z,
        blockId,
        previousBlockId: VALID_BLOCK_IDS.has(previousBlockId) ? previousBlockId : null
    };
}

function applyBlockChange(change) {
    gameState.data[getDataStoreKey(change.x, change.y, change.z)] = change.blockId;
}

function decorateStateWithProfile(state, profile) {
    return {
        ...state,
        profile: {
            clientId: profile.clientId,
            coins: profile.coins,
            faction: profile.faction,
            blocksMined: profile.blocksMined,
            blocksPlaced: profile.blocksPlaced,
            quest: profile.quest
        }
    };
}

function getPlayersSnapshot() {
    return Object.fromEntries(players.entries());
}

function broadcastSystemMessage(message) {
    sendSystemMessage(io, message);
}

function denyBlockChange(socket, change, reason) {
    sendSystemMessage(socket, reason);

    if (change.previousBlockId !== null) {
        socket.emit('block:change', {
            x: change.x,
            y: change.y,
            z: change.z,
            blockId: change.previousBlockId,
            playerId: 'server',
            createdAt: Date.now()
        });
    }
}

function startWorldEvents() {
    setInterval(() => {
        const onlineProfiles = [...players.values()]
            .map((state) => gameState.profiles[state.clientId])
            .filter(Boolean);

        if (onlineProfiles.length === 0) return;

        onlineProfiles.forEach((profile) => {
            profile.coins += 1;
            const socket = [...io.sockets.sockets.values()]
                .find((candidate) => players.get(candidate.id)?.clientId === profile.clientId);
            if (socket) sendProfile(socket, profile);
        });

        broadcastSystemMessage('Événement monde: +1 coin aux explorateurs connectés.');
        scheduleSave();
    }, WORLD_EVENT_INTERVAL_MS);
}

async function installFrontend() {
    if (process.env.NODE_ENV === 'production') {
        const distPath = join(__dirname, 'dist');
        app.use(express.static(distPath));
        app.get('*', (_req, res) => {
            res.sendFile(join(distPath, 'index.html'));
        });
        return;
    }

    const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa'
    });

    app.use(vite.middlewares);
}

io.on('connection', (socket) => {
    socket.on('player:join', (payload = {}) => {
        const state = sanitizePlayerState({
            ...payload.state,
            clientId: payload.clientId,
            nickname: payload.nickname,
            color: payload.color
        });
        const profile = getOrCreateProfile(state);
        const enrichedState = decorateStateWithProfile(state, profile);

        players.set(socket.id, enrichedState);

        socket.emit('world:init', {
            playerId: socket.id,
            profile,
            meta: publicMeta(),
            world: {
                params: gameState.params,
                data: gameState.data
            },
            players: getPlayersSnapshot()
        });

        socket.broadcast.emit('player:joined', { id: socket.id, state: enrichedState });
        sendProfile(socket, profile);
        broadcastSystemMessage(`${state.nickname} a rejoint le serveur`);
    });

    socket.on('player:update', (rawState = {}) => {
        const previousState = players.get(socket.id);
        if (!previousState) return;

        const profile = gameState.profiles[previousState.clientId];
        const state = sanitizePlayerState({
            ...previousState,
            ...rawState,
            clientId: previousState.clientId,
            nickname: previousState.nickname,
            color: previousState.color
        });
        const enrichedState = decorateStateWithProfile(state, profile);

        players.set(socket.id, enrichedState);
        socket.broadcast.volatile.emit('player:update', { id: socket.id, state: enrichedState });
    });

    socket.on('player:interaction', (payload = {}) => {
        if (!players.has(socket.id)) return;

        const type = String(payload.type || '').slice(0, 32);
        if (!type) return;

        socket.broadcast.emit('player:interaction', {
            id: socket.id,
            type,
            createdAt: Date.now()
        });
    });

    socket.on('block:change', (payload = {}) => {
        const state = players.get(socket.id);
        if (!state) return;

        const change = normalizeBlockChange(payload);
        if (!change) return;

        if (!canBuildAt(state, change.x, change.z)) {
            denyBlockChange(socket, change, 'Zone protégée par un claim. Tape /claims pour voir les territoires.');
            return;
        }

        applyBlockChange(change);
        const profile = gameState.profiles[state.clientId];
        const completedQuest = updateProfileFromBlock(profile, change.blockId);
        sendProfile(socket, profile);
        if (completedQuest) {
            sendSystemMessage(socket, `Quête terminée +${completedQuest.reward} coins. Nouvelle quête: ${profile.quest.type === 'mine' ? 'miner' : 'placer'} ${profile.quest.target} blocs.`);
        }

        socket.broadcast.emit('block:change', {
            ...change,
            playerId: socket.id,
            createdAt: Date.now()
        });
    });

    socket.on('world:params', (params = {}) => {
        const state = players.get(socket.id);
        if (!state) return;

        const sanitizedParams = sanitizeWorldParams(params);
        if (!sanitizedParams) return;

        gameState.params = sanitizedParams;
        gameState.data = {};
        scheduleSave();

        socket.broadcast.emit('world:params', {
            params: gameState.params,
            data: gameState.data,
            playerId: socket.id
        });
        broadcastSystemMessage(`${state.nickname} a synchronisé un nouveau terrain.`);
    });

    socket.on('chat:message', (payload = {}) => {
        const state = players.get(socket.id);
        if (!state) return;

        const message = String(payload.message || '').trim().slice(0, MAX_CHAT_LENGTH);
        if (!message) return;

        if (message.startsWith('/')) {
            handleChatCommand({ socket, io, players, state, saveWorldState, message });
            return;
        }

        io.emit('chat:message', {
            id: `${socket.id}-${Date.now()}`,
            playerId: socket.id,
            nickname: state.nickname,
            color: state.color,
            message,
            createdAt: Date.now()
        });
    });

    socket.on('disconnect', () => {
        const state = players.get(socket.id);
        if (state) {
            const profile = gameState.profiles[state.clientId];
            if (profile) profile.lastSeen = Date.now();
        }

        players.delete(socket.id);
        socket.broadcast.emit('player:left', { id: socket.id });
        scheduleSave();

        if (state) broadcastSystemMessage(`${state.nickname} a quitté le serveur`);
    });
});

process.on('SIGINT', async () => {
    await saveWorldState();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await saveWorldState();
    process.exit(0);
});

await loadWorldState();
await installFrontend();
startWorldEvents();
setInterval(() => saveWorldState().catch(console.error), SAVE_INTERVAL_MS);

httpServer.listen(PORT, () => {
    const mode = process.env.NODE_ENV === 'production' && existsSync(join(__dirname, 'dist'))
        ? 'production'
        : 'dev';
    console.log(`Minecraft JavaScript Edition 2030 server running in ${mode} mode on http://localhost:${PORT}`);
});
