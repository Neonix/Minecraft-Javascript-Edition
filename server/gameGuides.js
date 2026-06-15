import { gameState } from './gameState.js';
import { sendSystemMessage } from './chatCommands.js';

function topProfiles(selector, label) {
    return Object.values(gameState.profiles)
        .slice()
        .sort((a, b) => selector(b) - selector(a))
        .slice(0, 5)
        .map((profile, index) => `${index + 1}. ${profile.nickname} ${selector(profile)} ${label}`)
        .join(' | ');
}

export function handleGuideCommand({ socket, players, message }) {
    const [raw, ...args] = message.slice(1).split(/\s+/);
    const command = raw.toLowerCase();

    if (command === 'testplan') {
        sendSystemMessage(socket, 'Test: ouvre 2 onglets, bouge les 2 joueurs, envoie un chat, mine/place un bloc, teste /claim puis essaie de casser depuis l autre joueur, teste /daily, /market, /contract, /spawn, puis regarde /api/status.');
        return true;
    }

    if (command === 'server') {
        sendSystemMessage(socket, `${players.size} joueur(s), ${Object.keys(gameState.profiles).length} profil(s), ${Object.keys(gameState.claims).length} claim(s), ${Object.keys(gameState.factions).length} faction(s), ${Object.keys(gameState.blueprints || {}).length} blueprint(s).`);
        return true;
    }

    if (command === 'leaderboard' || command === 'lb') {
        const type = (args[0] || 'coins').toLowerCase();
        if (type === 'coins') sendSystemMessage(socket, topProfiles((p) => Number(p.coins || 0), 'coins') || 'Aucun profil.');
        else if (type === 'rep') sendSystemMessage(socket, topProfiles((p) => Number(p.reputation || 0), 'rep') || 'Aucun profil.');
        else if (type === 'mine') sendSystemMessage(socket, topProfiles((p) => Number(p.blocksMined || 0), 'mines') || 'Aucun profil.');
        else if (type === 'build') sendSystemMessage(socket, topProfiles((p) => Number(p.blocksPlaced || 0), 'builds') || 'Aucun profil.');
        else sendSystemMessage(socket, 'Leaderboards: /lb coins, /lb rep, /lb mine, /lb build.');
        return true;
    }

    if (command === 'guide') {
        const topic = (args[0] || 'start').toLowerCase();
        const guides = {
            start: 'Start: /daily, mine/place, /claim, /sethome base, /faction create nom, /build list.',
            multi: 'Multi: ouvre 2 onglets ou 2 appareils sur la meme URL. Tu dois voir le second avatar avec son pseudo.',
            mobile: 'Mobile: ouvre l URL locale sur ton telephone, utilise joystick gauche, zone droite camera, ACT, JUMP et CHAT.',
            economy: 'Eco: /kit starter, /market sell prix texte, /contract create reward texte, /rep.',
            protect: 'Protect: /claim sur un chunk. Un autre joueur ne doit pas pouvoir modifier tes blocs.'
        };
        sendSystemMessage(socket, guides[topic] || `Guides: ${Object.keys(guides).join(', ')}.`);
        return true;
    }

    return false;
}
