import { gameState, grantCoins, scheduleSave } from './gameState.js';
import { sendProfile, sendSystemMessage } from './chatCommands.js';

const ACHIEVEMENTS = [
    { id: 'first_steps', label: 'Premiers pas', reward: 10, check: (p) => (p.blocksMined + p.blocksPlaced) >= 1 },
    { id: 'miner_100', label: 'Mineur 100', reward: 60, check: (p) => p.blocksMined >= 100 },
    { id: 'builder_100', label: 'Architecte 100', reward: 60, check: (p) => p.blocksPlaced >= 100 },
    { id: 'capitalist', label: 'Capitaliste', reward: 80, check: (p) => p.coins >= 500 },
    { id: 'civilization', label: 'Civilisation', reward: 40, check: (p) => Boolean(p.faction) },
    { id: 'ugc_creator', label: 'Createur UGC', reward: 50, check: (p) => (p.blueprintsSaved || 0) >= 1 }
];

function ensureProgress(profile) {
    profile.badges ??= [];
    profile.achievementsClaimed ??= [];
    profile.daily ??= null;
    gameState.news ??= [];
}

function codex(topic) {
    const entries = {
        start: 'Objectif: construire une civilisation. Utilise /daily, /quest, /claim, /faction create, /build list.',
        money: 'Coins: mine, place, fais /daily, complete /quest, participe aux events, puis depense dans /shop et /build.',
        protect: 'Protection: /claim protege le chunk. En faction, tes membres peuvent construire sur tes claims.',
        ugc: 'UGC: construis, puis /blueprint save nom rayon. Repose avec /blueprint paste nom.',
        mobile: 'Mobile: joystick gauche, zone droite pour regarder, ACT pour casser/placer, CHAT pour ouvrir le chat.'
    };
    return entries[topic] || `Topics: ${Object.keys(entries).join(', ')}`;
}

export function handleProgressionCommand({ socket, state, message }) {
    const profile = gameState.profiles[state.clientId];
    if (!profile) return false;
    ensureProgress(profile);

    const [raw, ...args] = message.slice(1).split(/\s+/);
    const command = raw.toLowerCase();

    if (command === 'daily') {
        const today = new Date().toISOString().slice(0, 10);
        if (profile.daily?.date === today) {
            sendSystemMessage(socket, `Daily deja recupere: +${profile.daily.reward} coins.`);
            return true;
        }
        const reward = 35 + Math.floor(Math.random() * 30);
        profile.daily = { date: today, reward, claimedAt: Date.now() };
        grantCoins(profile, reward);
        sendProfile(socket, profile);
        scheduleSave();
        sendSystemMessage(socket, `Daily claim: +${reward} coins.`);
        return true;
    }

    if (command === 'achievements' || command === 'badges') {
        const unlocked = [];
        for (const achievement of ACHIEVEMENTS) {
            if (profile.achievementsClaimed.includes(achievement.id)) continue;
            if (!achievement.check(profile)) continue;
            profile.achievementsClaimed.push(achievement.id);
            profile.badges.push(achievement.label);
            grantCoins(profile, achievement.reward);
            unlocked.push(`${achievement.label} +${achievement.reward}c`);
        }
        sendProfile(socket, profile);
        scheduleSave();
        const badges = profile.badges.length ? profile.badges.join(' | ') : 'aucun badge';
        sendSystemMessage(socket, unlocked.length ? `Nouveaux succes: ${unlocked.join(' | ')}. Badges: ${badges}` : `Badges: ${badges}`);
        return true;
    }

    if (command === 'codex') {
        sendSystemMessage(socket, codex((args[0] || 'start').toLowerCase()));
        return true;
    }

    if (command === 'news') {
        const latest = gameState.news.slice(-5).map((item) => item.message).join(' | ');
        sendSystemMessage(socket, latest || 'Aucune news serveur.');
        return true;
    }

    if (command === 'announce') {
        const cost = 25;
        const text = args.join(' ').slice(0, 120);
        if (!text) return sendSystemMessage(socket, 'Usage: /announce <message>'), true;
        if (profile.coins < cost) return sendSystemMessage(socket, `Il faut ${cost} coins.`), true;
        profile.coins -= cost;
        gameState.news.push({ message: `${profile.nickname}: ${text}`, createdAt: Date.now() });
        if (gameState.news.length > 20) gameState.news.shift();
        sendProfile(socket, profile);
        scheduleSave();
        sendSystemMessage(socket, 'Annonce publiee dans /news.');
        return true;
    }

    return false;
}
