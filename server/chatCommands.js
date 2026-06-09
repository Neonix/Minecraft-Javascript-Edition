import {
    describeQuest,
    gameState,
    getChunkCoords,
    getClaimKey,
    publicMeta,
    scheduleSave
} from './gameState.js';

function normalizeFactionName(name) {
    return String(name || '')
        .replace(/[^\p{L}\p{N}_\- ]/gu, '')
        .trim()
        .slice(0, 22);
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
        coins: profile.coins,
        faction: profile.faction,
        blocksMined: profile.blocksMined,
        blocksPlaced: profile.blocksPlaced,
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

function isClaimOwnerOrMember(claim, clientId) {
    if (!claim) return false;
    if (claim.ownerClientId === clientId) return true;
    const faction = claim.factionName ? gameState.factions[claim.factionName] : null;
    return Boolean(faction?.members?.includes(clientId));
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
        io.emit('world:meta', publicMeta());
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
        io.emit('world:meta', publicMeta());
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
        io.emit('world:meta', publicMeta());
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
            sendSystemMessage(socket, 'Commandes: /profile, /quest, /top, /claim, /unclaim, /claims, /faction create|join|leave|info, /pay <joueur> <coins>, /save');
            return true;

        case 'profile':
            sendSystemMessage(socket, `${profile.nickname}: ${profile.coins} coins, faction: ${profile.faction || 'aucune'}, minés: ${profile.blocksMined}, placés: ${profile.blocksPlaced}.`);
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
            io.emit('world:meta', publicMeta());
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
            io.emit('world:meta', publicMeta());
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

export { sendProfile, sendSystemMessage };
