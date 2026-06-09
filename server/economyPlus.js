import { gameState, grantCoins, scheduleSave, slugify } from './gameState.js';
import { sendProfile, sendSystemMessage } from './chatCommands.js';

function ensureEconomy(profile) {
    gameState.market ??= {};
    gameState.contracts ??= {};
    profile.kits ??= {};
    profile.reputation = Number(profile.reputation || 0);
}

function now() {
    return Date.now();
}

function nextId(prefix, collection) {
    return `${prefix}-${Object.keys(collection).length + 1}-${Math.random().toString(16).slice(2, 6)}`;
}

function findProfileByName(name) {
    const wanted = String(name || '').toLowerCase();
    return Object.values(gameState.profiles).find((profile) => profile.nickname.toLowerCase() === wanted);
}

function handleKit(socket, profile, args) {
    const kit = (args[0] || 'starter').toLowerCase();
    const kits = {
        starter: { cooldown: 24 * 60 * 60 * 1000, coins: 20, text: 'Kit starter: +20 coins.' },
        builder: { cooldown: 24 * 60 * 60 * 1000, coins: 35, text: 'Kit builder: +35 coins pour construire.' },
        explorer: { cooldown: 12 * 60 * 60 * 1000, coins: 15, text: 'Kit explorer: +15 coins.' }
    };
    const config = kits[kit];
    if (!config) {
        sendSystemMessage(socket, `Kits: ${Object.keys(kits).join(', ')}.`);
        return true;
    }

    const lastClaim = Number(profile.kits[kit] || 0);
    const remaining = lastClaim + config.cooldown - now();
    if (remaining > 0) {
        const minutes = Math.ceil(remaining / 60000);
        sendSystemMessage(socket, `Kit deja pris. Reviens dans ${minutes} min.`);
        return true;
    }

    profile.kits[kit] = now();
    grantCoins(profile, config.coins);
    sendProfile(socket, profile);
    scheduleSave();
    sendSystemMessage(socket, config.text);
    return true;
}

function handleMarket(socket, profile, args) {
    const action = args[0]?.toLowerCase();

    if (!action || action === 'list') {
        const listings = Object.values(gameState.market)
            .filter((item) => item.status === 'open')
            .slice(0, 10)
            .map((item) => `${item.id}: ${item.title} ${item.price}c by ${item.sellerName}`)
            .join(' | ');
        sendSystemMessage(socket, listings || 'Market vide. /market sell <prix> <texte>');
        return true;
    }

    if (action === 'sell') {
        const price = Math.max(1, Math.floor(Number(args[1]) || 0));
        const title = args.slice(2).join(' ').trim().slice(0, 80);
        if (!price || !title) {
            sendSystemMessage(socket, 'Usage: /market sell <prix> <texte>');
            return true;
        }
        const fee = Math.max(1, Math.ceil(price * 0.05));
        if (profile.coins < fee) {
            sendSystemMessage(socket, `Il faut ${fee} coins de frais de listing.`);
            return true;
        }
        profile.coins -= fee;
        const id = nextId('m', gameState.market);
        gameState.market[id] = {
            id,
            sellerClientId: profile.clientId,
            sellerName: profile.nickname,
            title,
            price,
            status: 'open',
            createdAt: now()
        };
        sendProfile(socket, profile);
        scheduleSave();
        sendSystemMessage(socket, `Annonce market ${id} publiee.`);
        return true;
    }

    if (action === 'buy') {
        const id = args[1];
        const item = gameState.market[id];
        if (!item || item.status !== 'open') {
            sendSystemMessage(socket, 'Listing introuvable.');
            return true;
        }
        if (item.sellerClientId === profile.clientId) {
            sendSystemMessage(socket, 'Tu ne peux pas acheter ton listing.');
            return true;
        }
        if (profile.coins < item.price) {
            sendSystemMessage(socket, 'Pas assez de coins.');
            return true;
        }
        const seller = gameState.profiles[item.sellerClientId];
        profile.coins -= item.price;
        if (seller) {
            seller.coins += item.price;
            seller.reputation = Number(seller.reputation || 0) + 1;
        }
        profile.reputation += 1;
        item.status = 'sold';
        item.buyerClientId = profile.clientId;
        item.buyerName = profile.nickname;
        item.soldAt = now();
        sendProfile(socket, profile);
        scheduleSave();
        sendSystemMessage(socket, `Achat effectue: ${item.title}. Contacte ${item.sellerName} pour finaliser.`);
        return true;
    }

    if (action === 'cancel') {
        const id = args[1];
        const item = gameState.market[id];
        if (!item || item.sellerClientId !== profile.clientId || item.status !== 'open') {
            sendSystemMessage(socket, 'Listing introuvable ou non annulable.');
            return true;
        }
        item.status = 'cancelled';
        scheduleSave();
        sendSystemMessage(socket, `Listing ${id} annule.`);
        return true;
    }

    sendSystemMessage(socket, 'Usage: /market list, /market sell <prix> <texte>, /market buy <id>, /market cancel <id>.');
    return true;
}

function handleContract(socket, profile, args) {
    const action = args[0]?.toLowerCase();

    if (!action || action === 'list') {
        const list = Object.values(gameState.contracts)
            .filter((contract) => contract.status === 'open')
            .slice(0, 10)
            .map((contract) => `${contract.id}: ${contract.title} ${contract.reward}c by ${contract.creatorName}`)
            .join(' | ');
        sendSystemMessage(socket, list || 'Aucun contrat. /contract create <reward> <texte>');
        return true;
    }

    if (action === 'create') {
        const reward = Math.max(1, Math.floor(Number(args[1]) || 0));
        const title = args.slice(2).join(' ').trim().slice(0, 100);
        if (!reward || !title) {
            sendSystemMessage(socket, 'Usage: /contract create <reward> <texte>');
            return true;
        }
        if (profile.coins < reward) {
            sendSystemMessage(socket, 'Pas assez de coins pour financer le contrat.');
            return true;
        }
        profile.coins -= reward;
        const id = nextId('c', gameState.contracts);
        gameState.contracts[id] = {
            id,
            creatorClientId: profile.clientId,
            creatorName: profile.nickname,
            title,
            reward,
            status: 'open',
            createdAt: now()
        };
        sendProfile(socket, profile);
        scheduleSave();
        sendSystemMessage(socket, `Contrat ${id} cree.`);
        return true;
    }

    if (action === 'accept') {
        const id = args[1];
        const contract = gameState.contracts[id];
        if (!contract || contract.status !== 'open') {
            sendSystemMessage(socket, 'Contrat introuvable.');
            return true;
        }
        if (contract.creatorClientId === profile.clientId) {
            sendSystemMessage(socket, 'Tu ne peux pas accepter ton contrat.');
            return true;
        }
        contract.status = 'accepted';
        contract.workerClientId = profile.clientId;
        contract.workerName = profile.nickname;
        contract.acceptedAt = now();
        scheduleSave();
        sendSystemMessage(socket, `Contrat ${id} accepte. Le createur doit valider avec /contract complete ${id}.`);
        return true;
    }

    if (action === 'complete') {
        const id = args[1];
        const contract = gameState.contracts[id];
        if (!contract || contract.creatorClientId !== profile.clientId || contract.status !== 'accepted') {
            sendSystemMessage(socket, 'Contrat non validable.');
            return true;
        }
        const worker = gameState.profiles[contract.workerClientId];
        if (worker) {
            worker.coins += contract.reward;
            worker.reputation = Number(worker.reputation || 0) + 2;
        }
        contract.status = 'complete';
        contract.completedAt = now();
        scheduleSave();
        sendSystemMessage(socket, `Contrat ${id} complete. ${contract.workerName} recoit ${contract.reward} coins.`);
        return true;
    }

    sendSystemMessage(socket, 'Usage: /contract list, /contract create <reward> <texte>, /contract accept <id>, /contract complete <id>.');
    return true;
}

export function handleEconomyPlusCommand({ socket, state, message }) {
    const profile = gameState.profiles[state.clientId];
    if (!profile) return false;
    ensureEconomy(profile);

    const [raw, ...args] = message.slice(1).split(/\s+/);
    const command = raw.toLowerCase();

    if (command === 'kit') return handleKit(socket, profile, args);
    if (command === 'market') return handleMarket(socket, profile, args);
    if (command === 'contract') return handleContract(socket, profile, args);
    if (command === 'rep' || command === 'reputation') {
        const target = findProfileByName(args[0]) || profile;
        sendSystemMessage(socket, `${target.nickname}: reputation ${Number(target.reputation || 0)}.`);
        return true;
    }
    return false;
}
