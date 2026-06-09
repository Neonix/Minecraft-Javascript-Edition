import { gameState, scheduleSave, slugify } from './gameState.js';
import { sendProfile, sendSystemMessage } from './chatCommands.js';

function ensureSocial(profile) {
    gameState.parties ??= {};
    profile.party ??= null;
}

function findOnlineState(players, clientId) {
    return [...players.values()].find((state) => state.clientId === clientId);
}

export function handleSocialCommand({ socket, io, players, state, message }) {
    const profile = gameState.profiles[state.clientId];
    if (!profile) return false;
    ensureSocial(profile);

    const [raw, ...args] = message.slice(1).split(/\s+/);
    const command = raw.toLowerCase();

    if (command === 'party') {
        const action = args[0]?.toLowerCase();

        if (action === 'create') {
            if (profile.party) return sendSystemMessage(socket, 'Tu es deja dans une party.'), true;
            const name = slugify(args[1] || `${profile.nickname}-party`, 'party').slice(0, 22);
            gameState.parties[name] = {
                name,
                leaderClientId: profile.clientId,
                leaderName: profile.nickname,
                members: [profile.clientId],
                createdAt: Date.now()
            };
            profile.party = name;
            sendProfile(socket, profile);
            scheduleSave();
            sendSystemMessage(io, `${profile.nickname} a cree la party ${name}.`);
            return true;
        }

        if (action === 'join') {
            const name = slugify(args[1], 'party').slice(0, 22);
            const party = gameState.parties[name];
            if (!party) return sendSystemMessage(socket, 'Party introuvable.'), true;
            if (profile.party) return sendSystemMessage(socket, 'Quitte ta party actuelle avant.'), true;
            party.members.push(profile.clientId);
            profile.party = name;
            sendProfile(socket, profile);
            scheduleSave();
            sendSystemMessage(io, `${profile.nickname} a rejoint la party ${name}.`);
            return true;
        }

        if (action === 'leave') {
            if (!profile.party) return sendSystemMessage(socket, 'Tu n as pas de party.'), true;
            const oldParty = profile.party;
            const party = gameState.parties[oldParty];
            if (party) {
                party.members = party.members.filter((id) => id !== profile.clientId);
                if (party.members.length === 0) delete gameState.parties[oldParty];
            }
            profile.party = null;
            sendProfile(socket, profile);
            scheduleSave();
            sendSystemMessage(socket, `Tu as quitte ${oldParty}.`);
            return true;
        }

        if (action === 'tp') {
            const party = gameState.parties[profile.party];
            if (!party) return sendSystemMessage(socket, 'Tu n as pas de party.'), true;
            const leaderState = findOnlineState(players, party.leaderClientId);
            if (!leaderState) return sendSystemMessage(socket, 'Leader hors ligne.'), true;
            socket.emit('player:teleport', { position: leaderState.position, message: 'Teleportation vers le leader de party.' });
            return true;
        }

        const party = gameState.parties[profile.party];
        if (!party) sendSystemMessage(socket, 'Aucune party. /party create <nom> ou /party join <nom>.');
        else sendSystemMessage(socket, `${party.name}: leader ${party.leaderName}, ${party.members.length} membre(s).`);
        return true;
    }

    if (command === 'bank') {
        if (!profile.faction) return sendSystemMessage(socket, 'Il faut etre dans une faction.'), true;
        const faction = gameState.factions[profile.faction];
        if (!faction) return sendSystemMessage(socket, 'Faction introuvable.'), true;
        faction.bank = Number(faction.bank || 0);
        const action = args[0]?.toLowerCase();
        const amount = Math.max(0, Math.floor(Number(args[1]) || 0));

        if (action === 'deposit') {
            if (amount <= 0) return sendSystemMessage(socket, 'Montant invalide.'), true;
            if (profile.coins < amount) return sendSystemMessage(socket, 'Pas assez de coins.'), true;
            profile.coins -= amount;
            faction.bank += amount;
            sendProfile(socket, profile);
            scheduleSave();
            sendSystemMessage(socket, `${amount} coins deposes dans la banque de ${faction.name}.`);
            return true;
        }

        if (action === 'withdraw') {
            if (faction.ownerClientId !== profile.clientId) return sendSystemMessage(socket, 'Seul le fondateur peut retirer.'), true;
            if (amount <= 0 || faction.bank < amount) return sendSystemMessage(socket, 'Montant invalide.'), true;
            faction.bank -= amount;
            profile.coins += amount;
            sendProfile(socket, profile);
            scheduleSave();
            sendSystemMessage(socket, `${amount} coins retires de la banque.`);
            return true;
        }

        sendSystemMessage(socket, `Banque ${faction.name}: ${faction.bank} coins. /bank deposit <montant>, /bank withdraw <montant>.`);
        return true;
    }

    return false;
}
