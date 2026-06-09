import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAVE_DIR = join(__dirname, '..', 'data');
const SAVE_FILE = join(SAVE_DIR, 'world-state.json');
const CHUNK_WIDTH = 24;
const STARTING_COINS = 25;

export const gameState = {
    version: 2,
    params: null,
    data: {},
    profiles: {},
    claims: {},
    factions: {},
    stats: {
        totalConnections: 0,
        totalBlocksMined: 0,
        totalBlocksPlaced: 0,
        startedAt: Date.now(),
        lastSavedAt: null
    }
};

let saveTimer = null;

export function slugify(value, fallback = 'player') {
    const cleaned = String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);

    return cleaned || `${fallback}-${Math.floor(Math.random() * 9999)}`;
}

export function getChunkCoords(x, z) {
    return {
        x: Math.floor(Number(x) / CHUNK_WIDTH),
        z: Math.floor(Number(z) / CHUNK_WIDTH)
    };
}

export function getClaimKey(x, z) {
    const chunk = getChunkCoords(x, z);
    return `${chunk.x}:${chunk.z}`;
}

export function getDataStoreKey(x, y, z) {
    const chunk = getChunkCoords(x, z);
    const blockX = x - CHUNK_WIDTH * chunk.x;
    const blockZ = z - CHUNK_WIDTH * chunk.z;
    return `${chunk.x * CHUNK_WIDTH}-${chunk.z * CHUNK_WIDTH}-${blockX}-${y}-${blockZ}`;
}

export function publicMeta() {
    return {
        claims: gameState.claims,
        factions: gameState.factions,
        stats: gameState.stats
    };
}

export function createQuest() {
    return {
        type: Math.random() > 0.5 ? 'mine' : 'place',
        target: 20,
        progress: 0,
        reward: 75,
        createdAt: Date.now()
    };
}

export function describeQuest(quest) {
    if (!quest) return 'aucune quête active';
    const action = quest.type === 'mine' ? 'miner' : 'placer';
    return `${action} ${quest.target} blocs (${quest.progress}/${quest.target})`;
}

export function getOrCreateProfile(state) {
    const clientId = slugify(state.clientId || state.nickname, 'client');
    const existing = gameState.profiles[clientId];

    if (existing) {
        existing.nickname = state.nickname;
        existing.color = state.color;
        existing.lastSeen = Date.now();
        existing.coins = Number(existing.coins || STARTING_COINS);
        existing.blocksMined = Number(existing.blocksMined || 0);
        existing.blocksPlaced = Number(existing.blocksPlaced || 0);
        existing.quest ??= createQuest();
        return existing;
    }

    const profile = {
        clientId,
        nickname: state.nickname,
        color: state.color,
        coins: STARTING_COINS,
        faction: null,
        blocksMined: 0,
        blocksPlaced: 0,
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        quest: createQuest()
    };

    gameState.profiles[clientId] = profile;
    gameState.stats.totalConnections++;
    scheduleSave();
    return profile;
}

export function updateProfileFromBlock(profile, blockId) {
    profile.quest ??= createQuest();
    const action = blockId === 0 ? 'mine' : 'place';

    if (action === 'mine') {
        profile.coins += 2;
        profile.blocksMined++;
        gameState.stats.totalBlocksMined++;
    } else {
        profile.coins += 1;
        profile.blocksPlaced++;
        gameState.stats.totalBlocksPlaced++;
    }

    let completedQuest = null;
    if (profile.quest.type === action) {
        profile.quest.progress++;
        if (profile.quest.progress >= profile.quest.target) {
            completedQuest = profile.quest;
            profile.coins += profile.quest.reward;
            profile.quest = createQuest();
        }
    }

    scheduleSave();
    return completedQuest;
}

export function canBuildAt(state, x, z) {
    const claim = gameState.claims[getClaimKey(x, z)];
    if (!claim) return true;
    if (claim.ownerClientId === state.clientId) return true;

    const faction = claim.factionName ? gameState.factions[claim.factionName] : null;
    return Boolean(faction?.members?.includes(state.clientId));
}

export async function loadWorldState() {
    try {
        const raw = await readFile(SAVE_FILE, 'utf-8');
        const saved = JSON.parse(raw);
        gameState.version = saved.version || gameState.version;
        gameState.params = saved.params || null;
        gameState.data = saved.data || {};
        gameState.profiles = saved.profiles || {};
        gameState.claims = saved.claims || {};
        gameState.factions = saved.factions || {};
        gameState.stats = { ...gameState.stats, ...saved.stats, startedAt: Date.now() };
        console.log(`Loaded persistent world: ${Object.keys(gameState.data).length} block changes, ${Object.keys(gameState.profiles).length} profiles.`);
    } catch (error) {
        if (error.code !== 'ENOENT') console.warn('Could not load persistent world:', error);
    }
}

export async function saveWorldState() {
    await mkdir(SAVE_DIR, { recursive: true });
    gameState.stats.lastSavedAt = Date.now();
    await writeFile(SAVE_FILE, JSON.stringify(gameState, null, 2));
}

export function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWorldState().catch(console.error), 1000);
}
