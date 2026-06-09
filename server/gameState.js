import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAVE_DIR = join(__dirname, '..', 'data');
const SAVE_FILE = join(SAVE_DIR, 'world-state.json');
const CHUNK_WIDTH = 24;
const STARTING_COINS = 25;

export const gameState = {
    version: 3,
    params: null,
    data: {},
    profiles: {},
    claims: {},
    factions: {},
    blueprints: {},
    spawn: { x: 32, y: 16, z: 32 },
    worldEvent: null,
    stats: {
        totalConnections: 0,
        totalBlocksMined: 0,
        totalBlocksPlaced: 0,
        totalBlueprintsSaved: 0,
        totalStructuresBuilt: 0,
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

export function parseDataStoreKey(key) {
    const match = String(key).match(/^(-?\d+)-(-?\d+)-(-?\d+)-(-?\d+)-(-?\d+)$/);
    if (!match) return null;

    const [, chunkBaseX, chunkBaseZ, blockX, y, blockZ] = match.map(Number);
    return {
        x: chunkBaseX + blockX,
        y,
        z: chunkBaseZ + blockZ
    };
}

export function publicMeta() {
    const blueprintSummary = Object.fromEntries(
        Object.entries(gameState.blueprints).map(([name, blueprint]) => [name, {
            name,
            ownerName: blueprint.ownerName,
            blocks: blueprint.blocks?.length || 0,
            createdAt: blueprint.createdAt
        }])
    );

    return {
        claims: gameState.claims,
        factions: gameState.factions,
        blueprints: blueprintSummary,
        spawn: gameState.spawn,
        worldEvent: gameState.worldEvent,
        stats: gameState.stats
    };
}

export function createQuest() {
    const type = ['mine', 'place', 'earn'][Math.floor(Math.random() * 3)];
    if (type === 'earn') {
        return {
            type,
            target: 120,
            progress: 0,
            reward: 90,
            createdAt: Date.now()
        };
    }

    return {
        type,
        target: 20,
        progress: 0,
        reward: 75,
        createdAt: Date.now()
    };
}

export function describeQuest(quest) {
    if (!quest) return 'aucune quête active';
    if (quest.type === 'earn') return `gagner ${quest.target} coins (${quest.progress}/${quest.target})`;
    const action = quest.type === 'mine' ? 'miner' : 'placer';
    return `${action} ${quest.target} blocs (${quest.progress}/${quest.target})`;
}

function normalizeExistingProfile(profile) {
    profile.coins = Number(profile.coins || STARTING_COINS);
    profile.blocksMined = Number(profile.blocksMined || 0);
    profile.blocksPlaced = Number(profile.blocksPlaced || 0);
    profile.structuresBuilt = Number(profile.structuresBuilt || 0);
    profile.blueprintsSaved = Number(profile.blueprintsSaved || 0);
    profile.title ||= 'Explorateur';
    profile.quest ??= createQuest();
    return profile;
}

export function getOrCreateProfile(state) {
    const clientId = slugify(state.clientId || state.nickname, 'client');
    const existing = gameState.profiles[clientId];

    if (existing) {
        existing.nickname = state.nickname;
        existing.color = state.color;
        existing.lastSeen = Date.now();
        return normalizeExistingProfile(existing);
    }

    const profile = {
        clientId,
        nickname: state.nickname,
        color: state.color,
        title: 'Explorateur',
        coins: STARTING_COINS,
        faction: null,
        blocksMined: 0,
        blocksPlaced: 0,
        structuresBuilt: 0,
        blueprintsSaved: 0,
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        quest: createQuest()
    };

    gameState.profiles[clientId] = profile;
    gameState.stats.totalConnections++;
    scheduleSave();
    return profile;
}

function advanceEarnQuest(profile, amount) {
    if (profile.quest?.type !== 'earn') return null;
    profile.quest.progress += amount;
    if (profile.quest.progress < profile.quest.target) return null;

    const completedQuest = profile.quest;
    profile.coins += profile.quest.reward;
    profile.quest = createQuest();
    return completedQuest;
}

export function updateProfileFromBlock(profile, blockId) {
    profile.quest ??= createQuest();
    const action = blockId === 0 ? 'mine' : 'place';
    const earned = action === 'mine' ? 2 : 1;

    if (action === 'mine') {
        profile.coins += earned;
        profile.blocksMined++;
        gameState.stats.totalBlocksMined++;
    } else {
        profile.coins += earned;
        profile.blocksPlaced++;
        gameState.stats.totalBlocksPlaced++;
    }

    let completedQuest = advanceEarnQuest(profile, earned);
    if (!completedQuest && profile.quest.type === action) {
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

export function grantCoins(profile, amount) {
    const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
    profile.coins += safeAmount;
    return advanceEarnQuest(profile, safeAmount);
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
        gameState.blueprints = saved.blueprints || {};
        gameState.spawn = saved.spawn || gameState.spawn;
        gameState.worldEvent = saved.worldEvent || null;
        gameState.stats = { ...gameState.stats, ...saved.stats, startedAt: Date.now() };

        Object.values(gameState.profiles).forEach(normalizeExistingProfile);
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
