import { gameState, scheduleSave, slugify } from './gameState.js';
import { sendSystemMessage } from './chatCommands.js';

function ensureTravel(profile) {
    profile.homes ??= {};
    gameState.warps ??= {};
}

function pos(state) {
    return {
        x: Math.round(state.position.x),
        y: Math.round(state.position.y),
        z: Math.round(state.position.z)
    };
}

function teleport(socket, position, message) {
    socket.emit('player:teleport', { position, message });
}

export function handleTravelCommand({ socket, state, message }) {
    const profile = gameState.profiles[state.clientId];
    if (!profile) return false;
    ensureTravel(profile);

    const [raw, ...args] = message.slice(1).split(/\s+/);
    const command = raw.toLowerCase();

    if (command === 'sethome') {
        const name = slugify(args[0] || 'home', 'home').slice(0, 18);
        if (Object.keys(profile.homes).length >= 5 && !profile.homes[name]) {
            sendSystemMessage(socket, 'Limite atteinte: 5 homes maximum.');
            return true;
        }
        profile.homes[name] = pos(state);
        scheduleSave();
        sendSystemMessage(socket, `Home ${name} sauvegarde.`);
        return true;
    }

    if (command === 'home') {
        const name = slugify(args[0] || 'home', 'home').slice(0, 18);
        const home = profile.homes[name];
        if (!home) sendSystemMessage(socket, 'Home introuvable. Tape /homes.');
        else teleport(socket, home, `Teleportation vers ${name}.`);
        return true;
    }

    if (command === 'homes') {
        const names = Object.keys(profile.homes).join(' | ');
        sendSystemMessage(socket, names || 'Aucun home. Tape /sethome.');
        return true;
    }

    if (command === 'delhome') {
        const name = slugify(args[0] || 'home', 'home').slice(0, 18);
        if (!profile.homes[name]) sendSystemMessage(socket, 'Home introuvable.');
        else {
            delete profile.homes[name];
            scheduleSave();
            sendSystemMessage(socket, `Home ${name} supprime.`);
        }
        return true;
    }

    if (command === 'warps' || (command === 'warp' && (!args[0] || args[0] === 'list'))) {
        const list = Object.entries(gameState.warps).map(([name, warp]) => `${name}(${warp.ownerName})`).join(' | ');
        sendSystemMessage(socket, list || 'Aucun warp public.');
        return true;
    }

    if (command === 'warp' && args[0] === 'set') {
        const name = slugify(args[1], 'warp').slice(0, 18);
        const cost = 125;
        if (profile.coins < cost) {
            sendSystemMessage(socket, `Il faut ${cost} coins pour creer un warp.`);
            return true;
        }
        profile.coins -= cost;
        gameState.warps[name] = {
            ownerClientId: profile.clientId,
            ownerName: profile.nickname,
            position: pos(state),
            createdAt: Date.now()
        };
        scheduleSave();
        sendSystemMessage(socket, `Warp ${name} cree.`);
        return true;
    }

    if (command === 'warp' && args[0] === 'go') {
        const name = slugify(args[1], 'warp').slice(0, 18);
        const warp = gameState.warps[name];
        if (!warp) sendSystemMessage(socket, 'Warp introuvable.');
        else teleport(socket, warp.position, `Teleportation vers warp ${name}.`);
        return true;
    }

    return false;
}
