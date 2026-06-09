import {
    canBuildAt,
    createQuest,
    describeQuest,
    gameState,
    getChunkCoords,
    getClaimKey,
    getDataStoreKey,
    grantCoins,
    parseDataStoreKey,
    publicMeta,
    scheduleSave,
    slugify
} from './gameState.js';

const BUILD_COSTS = {
    beacon: 80,
    hut: 140,
    tower: 220,
    portal: 260
};

const SHOP = {
    quest: { cost: 15, label: 'reroll de quête' },
    title: { cost: 40, label: 'titre personnalisé' },
    festival: { cost: 120, label: 'festival communautaire' }
};

function normalizeFactionName(name) {
    return String(name || '')
        .replace(/[^\p{L}\p{N}_\- ]/gu, '')
        .trim()
        .slice(0, 22);
}

function normalizeTitle(title) {
    return String(title || '')
        .replace(/[^\p{L}\p{N}_\- ]/gu, '')
        .trim()
        .slice(0, 18) || 'Explorateur';
}

function sendSystemMessage(target, message) {
    target.emit('chat:message', {
        id: `system-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        system: true,
        nickname: 'Server',
        message,
        createdAt: Date.now()
    });
}

function sendProfile(socket, profile) {
    socket.emit('profile:update', {
        clientId: profile.clientId,
        nickname: profile.nickname,
        color: profile.color,
        title: profile.title,
        coins: profile.coins,
        faction: profile.faction,
        blocksMined: profile.blocksMined,
        blocksPlaced: profile.blocksPlaced,
        structuresBuilt: profile.structuresBuilt || 0,
        blueprintsSaved: profile.blueprintsSaved || 0,
        quest: profile.quest
    });
}

function findOnlinePlayerByNickname(players, nickname) {
    const wanted = String(nickname || '').toLowerCase();
    for (const [socketId, state] of players.entries()) {
        if (state.nickname.toLowerCase() === wanted) return { socketId, state };
    }
    return null;
}

function getOnlineSocketByClientId(io, players, clientId) {
    return [...io.sockets.sockets.values()]
        .find((candidate) => players.get(candidate.id)?.clientId === clientId);
}

function isClaimOwnerOrMember(claim, clientId) {
    if (!claim) return false;
    if (claim.ownerClientId === clientId) return true;
    const faction = claim.factionName ? gameState.factions[claim.factionName] : null;
    return Boolean(faction?.members?.includes(clientId));
}

function broadcastMeta(io) {
    io.emit('world:meta', publicMeta());
}

function block(x, y, z, blockId) {
    return { x, y, z, blockId };
}

function createPresetStructure(name, state) {
    const ox = Math.round(state.position.x);
    const oy = Math.max(1, Math.round(state.position.y - 1));
    const oz = Math.round(state.position.z);
    const blocks = [];

    if (name === 'beacon') {
        for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) blocks.push(block(ox + x, oy, oz + z, 3));
        }
        for (let y = 1; y <= 4; y++) blocks.push(block(ox, oy + y, oz, 5));
        blocks.push(block(ox, oy + 5, oz, 4));
    }

    if (name === 'hut') {
        for (let x = -2; x <= 2; x++) {
            for (let z = -2; z <= 2; z++) blocks.push(block(ox + x, oy, oz + z, 6));
        }
        for (let y = 1; y <= 3; y++) {
            for (let x = -2; x <= 2; x++) {
                blocks.push(block(ox + x, oy + y, oz - 2, 6));
                blocks.push(block(ox + x, oy + y, oz + 2, 6));
            }
            for (let z = -1; z <= 1; z++) {
                blocks.push(block(ox - 2, oy + y, oz + z, 6));
                blocks.push(block(ox + 2, oy + y, oz + z, 6));
            }
        }
        for (let x = -3; x <= 3; x++) {
            for (let z = -3; z <= 3; z++) blocks.push(block(ox + x, oy + 4, oz + z, 7));
        }
        blocks.push(block(ox, oy + 1, oz - 2, 0));
        blocks.push(block(ox, oy + 2, oz - 2, 0));
    }

    if (name === 'tower') {
        for (let y = 0; y <= 8; y++) {
            for (let x = -2; x <= 2; x++) {
                for (let z = -2; z <= 2; z++) {
                    const edge = Math.abs(x) === 2 || Math.abs(z) === 2;
                    const floor = y === 0 || y === 4 || y === 8;
                    if (edge || floor) blocks.push(block(ox + x, oy + y, oz + z, 3));
                }
            }
        }
        for (let x = -3; x <= 3; x++) {
            blocks.push(block(ox + x, oy + 9, oz - 3, 5));
            blocks.push(block(ox + x, oy + 9, oz + 3, 5));
            blocks.push(block(ox - 3, oy + 9, oz + x, 5));
            blocks.push(block(ox + 3, oy + 9, oz + x, 5));
        }
    }

    if (name === 'portal') {
        for (let y = 0; y <= 5; y++) {
            blocks.push(block(ox - 2, oy + y, oz, 4));
            blocks.push(block(ox + 2, oy + y, oz, 4));
        }
        for (let x = -2; x <= 2; x++) {
            blocks.push(block(ox + x, oy, oz, 4));
            blocks.push(block(ox + x, oy + 5, oz, 4));
        }
        for (let y = 1; y <= 4; y++) {
            for (let x = -1; x <= 1; x++) blocks.push(block(ox + x, oy + y, oz, 5));
        }
    }

    return blocks;
}

function canPlaceBlocks(state, blocks) {
    return blocks.every((entry) => canBuildAt(state, entry.x, entry.z));
}

function placeBlocks(io, blocks, playerId = 'server-build') {
    blocks.forEach((entry) => {
        gameState.data[getDataStoreKey(entry.x, entry.y, entry.z)] = entry.blockId;
        io.emit('block:change', {
            x: entry.x,
            y: entry.y,
            z: entry.z,
            blockId: entry.blockId,
            playerId,
            createdAt: Date.now()
        });
    });
    scheduleSave();
}

function handleBuildCommand({ socket, io, state, profile, args }) {
    const name = args[0]?.toLowerCase();
    if (!name || name === 'list') {
        return sendSystemMessage(socket, `Structures: ${Object.entries(BUILD_COSTS).map(([key, cost]) => `${key} ${cost}c`).join(' | ')}`);
    }
    if (!BUILD_COSTS[name]) return sendSystemMessage(socket, 'Structure inconnue. Tape /build list.');
    if (profile.coins < BUILD_COSTS[name]) return sendSystemMessage(socket, `Il faut ${BUILD_COSTS[name]} coins.`);

    const blocks = createPresetStructure(name, state);
    if (!canPlaceBlocks(state, blocks)) return sendSystemMessage(socket, 'Impossible: une partie de la structure touche un claim protégé.');

    profile.coins -= BUILD_COSTS[name];
    profile.structuresBuilt = (profile.structuresBuilt || 0) + 1;
    gameState.stats.totalStructuresBuilt++;
    placeBlocks(io, blocks, socket.id);
    sendProfile(socket, profile);
    broadcastMeta(io);
    sendSystemMessage(io, `${profile.nickname} a construit ${name} (${blocks.length} blocs).`);
}

function saveBlueprint({ socket, io, state, profile, name, radius }) {
    const safeName = slugify(name, 'blueprint').slice(0, 24);
    const safeRadius = Math.max(1, Math.min(8, Math.floor(Number(radius) || 4)));
    const origin = {
        x: Math.round(state.position.x),
        y: Math.round(state.position.y - 1),
        z: Math.round(state.position.z)
    };

    const blocks = Object.entries(gameState.data)
        .map(([key, blockId]) => ({ coords: parseDataStoreKey(key), blockId }))
        .filter((entry) => entry.coords)
        .filter(({ coords }) => Math.abs(coords.x - origin.x) <= safeRadius && Math.abs(coords.y - origin.y) <= safeRadius && Math.abs(coords.z - origin.z) <= safeRadius)
        .slice(0, 500)
        .map(({ coords, blockId }) => ({
            dx: coords.x - origin.x,
            dy: coords.y - origin.y,
            dz: coords.z - origin.z,
            blockId
        }));

    if (blocks.length === 0) return sendSystemMessage(socket, 'Aucun bloc modifié à sauvegarder autour de toi.');

    gameState.blueprints[safeName] = {
        name: safeName,
        ownerClientId: state.clientId,
        ownerName: profile.nickname,
        origin,
        radius: safeRadius,
        blocks,
        createdAt: Date.now()
    };
    profile.blueprintsSaved = (profile.blueprintsSaved || 0) + 1;
    gameState.stats.totalBlueprintsSaved++;
    sendProfile(socket, profile);
    broadcastMeta(io);
    scheduleSave();
    sendSystemMessage(socket, `Blueprint ${safeName} sauvegardé avec ${blocks.length} blocs.`);
}

function pasteBlueprint({ socket, io, state, profile, name }) {
    const safeName = slugify(name, 'blueprint').slice(0, 24);
    const blueprint = gameState.blueprints[safeName];
    if (!blueprint) return sendSystemMessage(socket, 'Blueprint introuvable.');

    const cost = Math.max(10, Math.ceil((blueprint.blocks?.length || 0) / 4));
    if (profile.coins < cost) return sendSystemMessage(socket, `Il faut ${cost} coins pour coller ce blueprint.`);

    const origin = {
        x: Math.round(state.position.x),
        y: Math.round(state.position.y - 1),
        z: Math.round(state.position.z)
    };

    const blocks = blueprint.blocks.map((entry) => ({
        x: origin.x + entry.dx,
        y: origin.y + entry.dy,
        z: origin.z + entry.dz,
        blockId: entry.blockId
    }));

    if (!canPlaceBlocks(state, blocks)) return sendSystemMessage(socket, 'Impossible: le blueprint touche un claim protégé.');

    profile.coins -= cost;
    profile.structuresBuilt = (profile.structuresBuilt || 0) + 1;
    placeBlocks(io, blocks, socket.id);
    sendProfile(socket, profile);
    sendSystemMessage(io, `${profile.nickname} a collé le blueprint ${safeName} (${blocks.length} blocs).`);
}

function handleBlueprintCommand({ socket, io, state, profile, args }) {
    const action = args[0]?.toLowerCase();
    if (action === 'save') return saveBlueprint({ socket, io, state, profile, name: args[1], radius: args[2] });
    if (action === 'paste') return pasteBlueprint({ socket, io, state, profile, name: args[1] });
    if (action === 'list') {
        const names = Object.values(gameState.blueprints)
            .slice(0, 20)
            .map((blueprint) => `${blueprint.name}(${blueprint.blocks.length})`)
            .join(' | ');
        return sendSystemMessage(socket, names || 'Aucun blueprint sauvegardé.');
    }
    if (action === 'delete') {
        const safeName = slugify(args[1], 'blueprint').slice(0, 24);
        const blueprint = gameState.blueprints[safeName];
        if (!blueprint) return sendSystemMessage(socket, 'Blueprint introuvable.');
        if (blueprint.ownerClientId !== state.clientId) return sendSystemMessage(socket, 'Tu ne peux supprimer que tes blueprints.');
        delete gameState.blueprints[safeName];
        broadcastMeta(io);
        scheduleSave();
        return sendSystemMessage(socket, `Blueprint ${safeName} supprimé.`);
    }
    sendSystemMessage(socket, 'Usage: /blueprint save <nom> [rayon], /blueprint paste <nom>, /blueprint list, /blueprint delete <nom>');
}

function handleShopCommand(socket) {
    sendSystemMessage(socket, `Shop: /buy quest ${SHOP.quest.cost}c | /buy title <titre> ${SHOP.title.cost}c | /buy festival ${SHOP.festival.cost}c | /build list pour les structures.`);
}

function handleBuyCommand({ socket, io, players, profile, args }) {
    const item = args[0]?.toLowerCase();
    if (item === 'quest') {
        if (profile.coins < SHOP.quest.cost) return sendSystemMessage(socket, `Il faut ${SHOP.quest.cost} coins.`);
        profile.coins -= SHOP.quest.cost;
        profile.quest = createQuest();
        sendProfile(socket, profile);
        scheduleSave();
        return sendSystemMessage(socket, `Nouvelle quête: ${describeQuest(profile.quest)}.`);
    }

    if (item === 'title') {
        const title = normalizeTitle(args.slice(1).join(' '));
        if (profile.coins < SHOP.title.cost) return sendSystemMessage(socket, `Il faut ${SHOP.title.cost} coins.`);
        profile.coins -= SHOP.title.cost;
        profile.title = title;
        sendProfile(socket, profile);
        scheduleSave();
        return sendSystemMessage(socket, `Titre équipé: ${title}.`);
    }

    if (item === 'festival') {
        if (profile.coins < SHOP.festival.cost) return sendSystemMessage(socket, `Il faut ${SHOP.festival.cost} coins.`);
        profile.coins -= SHOP.festival.cost;
        startCommunityEvent({ io, players, type: 'festival', startedBy: profile.nickname });
        sendProfile(socket, profile);
        return;
    }

    handleShopCommand(socket);
}

function startCommunityEvent({ io, players, type, startedBy }) {
    const labels = {
        festival: 'Festival communautaire',
        expedition: 'Expédition coopérative',
        goldrush: 'Ruée vers les minerais'
    };
    const event = {
        type,
        label: labels[type] || 'Événement monde',
        startedBy,
        startedAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000
    };
    gameState.worldEvent = event;

    [...players.values()].forEach((state) => {
        const profile = gameState.profiles[state.clientId];
        if (!profile) return;

        if (type === 'festival') grantCoins(profile, 10);
        if (type === 'expedition') profile.quest = { type: 'mine', target: 35, progress: 0, reward: 160, createdAt: Date.now() };

        const socket = getOnlineSocketByClientId(io, players, state.clientId);
        if (socket) sendProfile(socket, profile);
    });

    broadcastMeta(io);
    sendSystemMessage(io, `${event.label} lancé par ${startedBy}.`);
    scheduleSave();
}

function handleEventCommand({ socket, io, players, profile, args }) {
    const type = args[0]?.toLowerCase();
    if (!type || !['festival', 'expedition', 'goldrush'].includes(type)) {
        return sendSystemMessage(socket, 'Événements: /event festival, /event expedition, /event goldrush.');
    }
    if (profile.coins < 100) return sendSystemMessage(socket, 'Il faut 100 coins pour lancer un événement monde.');
    profile.coins -= 100;
    startCommunityEvent({ io, players, type, startedBy: profile.nickname });
    sendProfile(socket, profile);
}

function handleFactionCommand({ socket, io, state, profile, args }) {
    const action = args[0]?.toLowerCase();

    if (action === 'create') {
        const name = normalizeFactionName(args.slice(1).join(' '));
        if (!name) return sendSystemMessage(socket, 'Usage: /faction create <nom>');
        if (gameState.factions[name]) return sendSystemMessage(socket, 'Cette faction existe déjà.');
        if (profile.faction) return sendSystemMessage(socket, 'Quitte ta faction actuelle avant d’en créer une autre.');

        gameState.factions[name] = {
            name,
            ownerClientId: state.clientId,
            ownerName: profile.nickname,
            members: [state.clientId],
            color: profile.color,
            createdAt: Date.now()
        };
        profile.faction = name;
        sendProfile(socket, profile);
        broadcastMeta(io);
        sendSystemMessage(io, `${profile.nickname} a fondé la faction ${name}.`);
        scheduleSave();
        return;
    }

    if (action === 'join') {
        const name = normalizeFactionName(args.slice(1).join(' '));
        const faction = gameState.factions[name];
        if (!faction) return sendSystemMessage(socket, 'Faction introuvable.');
        if (profile.faction) return sendSystemMessage(socket, 'Quitte ta faction actuelle avant d’en rejoindre une autre.');

        faction.members.push(state.clientId);
        profile.faction = name;
        sendProfile(socket, profile);
        broadcastMeta(io);
        sendSystemMessage(io, `${profile.nickname} a rejoint la faction ${name}.`);
        scheduleSave();
        return;
    }

    if (action === 'leave') {
        if (!profile.faction) return sendSystemMessage(socket, 'Tu n’as pas de faction.');
        const oldFaction = profile.faction;
        const faction = gameState.factions[oldFaction];

        if (faction) {
            faction.members = faction.members.filter((clientId) => clientId !== state.clientId);
            if (faction.members.length === 0) delete gameState.factions[oldFaction];
        }

        profile.faction = null;
        sendProfile(socket, profile);
        broadcastMeta(io);
        sendSystemMessage(io, `${profile.nickname} a quitté la faction ${oldFaction}.`);
        scheduleSave();
        return;
    }

    if (action === 'info') {
        const name = normalizeFactionName(args.slice(1).join(' ')) || profile.faction;
        const faction = gameState.factions[name];
        if (!faction) return sendSystemMessage(socket, 'Faction introuvable.');
        return sendSystemMessage(socket, `${faction.name}: ${faction.members.length} membre(s), fondateur ${faction.ownerName}.`);
    }

    sendSystemMessage(socket, 'Usage: /faction create <nom>, /faction join <nom>, /faction leave, /faction info [nom]');
}

export function handleChatCommand({ socket, io, players, state, saveWorldState, message }) {
    const profile = gameState.profiles[state.clientId];
    const [rawCommand, ...args] = message.slice(1).split(/\s+/);
    const command = rawCommand?.toLowerCase();

    switch (command) {
        case 'help':
            sendSystemMessage(socket, 'Commandes: /profile, /quest, /top, /shop, /build list, /blueprint save|paste|list, /spawn, /setspawn, /claim, /faction create|join|leave|info, /event festival|expedition|goldrush, /pay, /save');
            return true;

        case 'profile':
            sendSystemMessage(socket, `${profile.nickname} [${profile.title || 'Explorateur'}]: ${profile.coins} coins, faction: ${profile.faction || 'aucune'}, minés: ${profile.blocksMined}, placés: ${profile.blocksPlaced}, structures: ${profile.structuresBuilt || 0}.`);
            return true;

        case 'quest':
            sendSystemMessage(socket, `Quête active: ${describeQuest(profile.quest)}. Récompense: ${profile.quest?.reward || 0} coins.`);
            return true;

        case 'top': {
            const top = Object.values(gameState.profiles)
                .sort((a, b) => b.coins - a.coins)
                .slice(0, 5)
                .map((entry, index) => `${index + 1}. ${entry.nickname} ${entry.coins}c`)
                .join(' | ');
            sendSystemMessage(socket, top || 'Aucun classement pour le moment.');
            return true;
        }

        case 'shop':
            handleShopCommand(socket);
            return true;

        case 'buy':
            handleBuyCommand({ socket, io, players, profile, args });
            return true;

        case 'build':
            handleBuildCommand({ socket, io, state, profile, args });
            return true;

        case 'blueprint':
        case 'bp':
            handleBlueprintCommand({ socket, io, state, profile, args });
            return true;

        case 'spawn':
            socket.emit('player:teleport', { position: gameState.spawn, message: 'Téléportation au spawn.' });
            return true;

        case 'setspawn':
            gameState.spawn = {
                x: Math.round(state.position.x),
                y: Math.round(state.position.y),
                z: Math.round(state.position.z)
            };
            broadcastMeta(io);
            scheduleSave();
            sendSystemMessage(io, `${profile.nickname} a défini un nouveau spawn serveur.`);
            return true;

        case 'event':
            handleEventCommand({ socket, io, players, profile, args });
            return true;

        case 'claim': {
            const key = getClaimKey(state.position.x, state.position.z);
            if (gameState.claims[key]) return sendSystemMessage(socket, 'Ce chunk est déjà claim.');
            const chunk = getChunkCoords(state.position.x, state.position.z);

            gameState.claims[key] = {
                ownerClientId: state.clientId,
                ownerName: profile.nickname,
                factionName: profile.faction,
                chunk,
                createdAt: Date.now()
            };
            broadcastMeta(io);
            sendSystemMessage(io, `${profile.nickname} a claim le chunk ${key}${profile.faction ? ` pour ${profile.faction}` : ''}.`);
            scheduleSave();
            return true;
        }

        case 'unclaim': {
            const key = getClaimKey(state.position.x, state.position.z);
            const claim = gameState.claims[key];
            if (!claim) return sendSystemMessage(socket, 'Aucun claim sur ce chunk.');
            if (!isClaimOwnerOrMember(claim, state.clientId)) return sendSystemMessage(socket, 'Tu ne peux pas retirer ce claim.');
            delete gameState.claims[key];
            broadcastMeta(io);
            sendSystemMessage(io, `${profile.nickname} a libéré le chunk ${key}.`);
            scheduleSave();
            return true;
        }

        case 'claims': {
            const claims = Object.entries(gameState.claims)
                .slice(0, 12)
                .map(([key, claim]) => `${key}:${claim.factionName || claim.ownerName}`)
                .join(' | ');
            sendSystemMessage(socket, claims || 'Aucun claim actif.');
            return true;
        }

        case 'faction':
            handleFactionCommand({ socket, io, state, profile, args });
            return true;

        case 'pay': {
            const [nickname, amountRaw] = args;
            const amount = Math.floor(Number(amountRaw));
            if (!nickname || !Number.isFinite(amount) || amount <= 0) return sendSystemMessage(socket, 'Usage: /pay <joueur> <coins>');
            if (profile.coins < amount) return sendSystemMessage(socket, 'Pas assez de coins.');

            const target = findOnlinePlayerByNickname(players, nickname);
            if (!target) return sendSystemMessage(socket, 'Joueur introuvable ou hors ligne.');
            const targetProfile = gameState.profiles[target.state.clientId];
            if (!targetProfile) return sendSystemMessage(socket, 'Profil cible introuvable.');

            profile.coins -= amount;
            targetProfile.coins += amount;
            sendProfile(socket, profile);

            const targetSocket = io.sockets.sockets.get(target.socketId);
            if (targetSocket) {
                sendProfile(targetSocket, targetProfile);
                sendSystemMessage(targetSocket, `${profile.nickname} t'a envoyé ${amount} coins.`);
            }
            sendSystemMessage(socket, `Tu as envoyé ${amount} coins à ${targetProfile.nickname}.`);
            scheduleSave();
            return true;
        }

        case 'save':
            saveWorldState().then(() => sendSystemMessage(socket, 'Monde sauvegardé sur disque.'));
            return true;

        default:
            sendSystemMessage(socket, 'Commande inconnue. Tape /help.');
            return true;
    }
}

export { sendProfile, sendSystemMessage, startCommunityEvent };
