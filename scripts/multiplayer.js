import { io } from 'socket.io-client';
import { RemotePlayers } from './remotePlayers';

const PLAYER_COLORS = [
    '#4f8cff',
    '#ff6b6b',
    '#7bd88f',
    '#ffd166',
    '#c77dff',
    '#ff9f1c',
    '#4ecdc4'
];

const CHUNK_WIDTH = 24;

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function makeClientId() {
    return `client-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
}

function makePlayerIdentity() {
    const stored = JSON.parse(localStorage.getItem('minecraft_multiplayer_identity') || 'null');
    if (stored?.clientId && stored?.nickname && stored?.color) return stored;

    const identity = {
        clientId: stored?.clientId || makeClientId(),
        nickname: stored?.nickname || `Player ${Math.floor(1000 + Math.random() * 9000)}`,
        color: stored?.color || PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]
    };

    localStorage.setItem('minecraft_multiplayer_identity', JSON.stringify(identity));
    return identity;
}

function blockChangeFromCoords(coords, blockId, previousBlockId = null) {
    return {
        x: Math.round(coords.x),
        y: Math.round(coords.y),
        z: Math.round(coords.z),
        blockId,
        previousBlockId
    };
}

function getDataStoreKey(x, y, z) {
    const chunkX = Math.floor(x / CHUNK_WIDTH);
    const chunkZ = Math.floor(z / CHUNK_WIDTH);
    const blockX = x - CHUNK_WIDTH * chunkX;
    const blockZ = z - CHUNK_WIDTH * chunkZ;

    return `${chunkX * CHUNK_WIDTH}-${chunkZ * CHUNK_WIDTH}-${blockX}-${y}-${blockZ}`;
}

function describeQuest(quest) {
    if (!quest) return 'aucune quête';
    if (quest.type === 'earn') return `Gagner ${quest.target} coins (${quest.progress}/${quest.target})`;
    return `${quest.type === 'mine' ? 'Miner' : 'Placer'} ${quest.target} blocs (${quest.progress}/${quest.target})`;
}

function formatTimeLeft(expiresAt) {
    if (!expiresAt) return '';
    const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export class MultiplayerClient {
    constructor({ scene, world, player }) {
        this.scene = scene;
        this.world = world;
        this.player = player;
        this.identity = makePlayerIdentity();
        this.remotePlayers = new RemotePlayers(scene);
        this.playerId = null;
        this.profile = null;
        this.meta = { claims: {}, factions: {}, blueprints: {}, stats: {}, worldEvent: null };
        this.lastPlayerUpdateAt = 0;
        this.lastActiveBlockId = player.activeBlockId;
        this.paramsUpdateTimeout = null;

        this.createHud();
        this.registerChatHotkeys();
        this.connect();
    }

    connect() {
        this.socket = io({
            autoConnect: true,
            reconnection: true,
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            this.setStatus('Connecté au serveur 2030');
            this.socket.emit('player:join', {
                clientId: this.identity.clientId,
                nickname: this.identity.nickname,
                color: this.identity.color,
                state: this.getPlayerState()
            });
        });

        this.socket.on('disconnect', () => {
            this.setStatus('Déconnecté du serveur');
            this.setPlayerCount(1);
        });

        this.socket.on('connect_error', () => {
            this.setStatus('Serveur multijoueur indisponible');
        });

        this.socket.on('world:init', ({ playerId, world, players, profile, meta }) => {
            this.playerId = playerId;
            this.profile = profile || null;
            this.meta = meta || this.meta;

            if (world?.params) {
                this.world.params = world.params;
            }
            this.world.dataStore.data = world?.data || {};
            this.world.generate();

            this.remotePlayers.sync(players, playerId);
            this.setPlayerCount(Object.keys(players || {}).length);
            this.renderProfile();
            this.renderMeta();
            this.addChatLine('Server', 'Bienvenue. Tape /help pour les commandes 2030.', true);
        });

        this.socket.on('profile:update', (profile) => {
            this.profile = profile;
            this.renderProfile();
        });

        this.socket.on('world:meta', (meta) => {
            this.meta = meta || this.meta;
            this.renderMeta();
        });

        this.socket.on('player:teleport', ({ position, message }) => {
            if (!position) return;
            this.player.position.set(position.x, position.y, position.z);
            this.player.velocity?.set?.(0, 0, 0);
            this.sendPlayerUpdate(true);
            this.addChatLine('Server', message || 'Téléportation.', true);
        });

        this.socket.on('world:params', ({ params, data }) => {
            if (params) this.world.params = params;
            this.world.dataStore.data = data || {};
            this.world.generate();
            this.addChatLine('Server', 'Le terrain a été synchronisé par un autre joueur.', true);
        });

        this.socket.on('block:change', (change) => {
            this.applyRemoteBlockChange(change);
            this.remotePlayers.triggerInteraction(change.playerId, change.blockId === 0 ? 'mine' : 'place');
        });

        this.socket.on('player:joined', ({ id, state }) => {
            this.remotePlayers.upsert(id, state, true);
            this.setPlayerCount(this.remotePlayers.players.size + 1);
        });

        this.socket.on('player:update', ({ id, state }) => {
            if (id !== this.playerId) {
                this.remotePlayers.upsert(id, state);
            }
        });

        this.socket.on('player:interaction', ({ id, type }) => {
            this.remotePlayers.triggerInteraction(id, type);
        });

        this.socket.on('player:left', ({ id }) => {
            this.remotePlayers.remove(id);
            this.setPlayerCount(this.remotePlayers.players.size + 1);
        });

        this.socket.on('chat:message', ({ nickname, message, system, color }) => {
            this.addChatLine(nickname, message, system, color);
        });
    }

    applyRemoteBlockChange(change) {
        if (!change) return;

        this.world.dataStore.data[getDataStoreKey(change.x, change.y, change.z)] = change.blockId;

        if (change.blockId === 0) {
            this.world.removeBlock(change.x, change.y, change.z);
        } else {
            this.world.addBlock(change.x, change.y, change.z, change.blockId);
        }
    }

    createHud() {
        const panel = document.createElement('div');
        panel.id = 'multiplayer-panel';
        panel.innerHTML = `
            <div id="multiplayer-status">Connexion...</div>
            <div id="multiplayer-count">1 joueur</div>
            <div id="multiplayer-name">${this.identity.nickname}</div>
            <div id="multiplayer-profile">Profil: chargement...</div>
            <div id="multiplayer-quest">Quête: chargement...</div>
            <div id="multiplayer-meta">Claims: 0 · Factions: 0</div>
            <div id="multiplayer-event">Événement: aucun</div>
        `;
        document.body.append(panel);

        const chat = document.createElement('div');
        chat.id = 'chat';
        chat.innerHTML = `
            <div id="chat-log"></div>
            <form id="chat-form">
                <input id="chat-input" maxlength="180" autocomplete="off" placeholder="Message ou /help..." />
            </form>
        `;
        document.body.append(chat);

        this.statusEl = panel.querySelector('#multiplayer-status');
        this.countEl = panel.querySelector('#multiplayer-count');
        this.profileEl = panel.querySelector('#multiplayer-profile');
        this.questEl = panel.querySelector('#multiplayer-quest');
        this.metaEl = panel.querySelector('#multiplayer-meta');
        this.eventEl = panel.querySelector('#multiplayer-event');
        this.chatLogEl = chat.querySelector('#chat-log');
        this.chatFormEl = chat.querySelector('#chat-form');
        this.chatInputEl = chat.querySelector('#chat-input');

        this.chatFormEl.addEventListener('submit', (event) => {
            event.preventDefault();
            const message = this.chatInputEl.value.trim();
            if (message) {
                this.socket.emit('chat:message', { message });
            }
            this.chatInputEl.value = '';
            this.chatInputEl.blur();
        });

        this.chatInputEl.addEventListener('keydown', (event) => {
            event.stopPropagation();
            if (event.code === 'Escape') {
                this.chatInputEl.value = '';
                this.chatInputEl.blur();
            }
        });
    }

    registerChatHotkeys() {
        document.addEventListener('keydown', (event) => {
            if (event.target === this.chatInputEl) return;

            if (event.code === 'KeyT' || event.code === 'Enter') {
                event.preventDefault();
                event.stopImmediatePropagation();
                this.openChat();
                return;
            }

            if (event.code === 'KeyE' && this.player.controls.isLocked) {
                this.sendInteraction('wave');
            }
        }, true);
    }

    openChat() {
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        this.chatInputEl.focus();
    }

    addChatLine(nickname, message, system = false, color = '#ffffff') {
        const line = document.createElement('div');
        line.className = system ? 'chat-line system' : 'chat-line';

        const name = document.createElement('span');
        name.className = 'chat-name';
        name.textContent = `${nickname}: `;
        name.style.color = color || '#ffffff';

        const body = document.createElement('span');
        body.textContent = message;

        line.append(name, body);
        this.chatLogEl.append(line);
        this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;

        while (this.chatLogEl.children.length > 10) {
            this.chatLogEl.firstChild.remove();
        }
    }

    setStatus(message) {
        if (this.statusEl) this.statusEl.textContent = message;
    }

    setPlayerCount(count) {
        if (this.countEl) this.countEl.textContent = `${count} joueur${count > 1 ? 's' : ''}`;
    }

    renderProfile() {
        if (!this.profile) return;
        if (this.profileEl) {
            this.profileEl.textContent = `${this.profile.title || 'Explorateur'} · ${this.profile.coins} coins · ${this.profile.faction || 'sans faction'} · ${this.profile.structuresBuilt || 0} builds`;
        }
        if (this.questEl) {
            this.questEl.textContent = `Quête: ${describeQuest(this.profile.quest)}`;
        }
    }

    renderMeta() {
        if (!this.metaEl) return;
        const claims = Object.keys(this.meta?.claims || {}).length;
        const factions = Object.keys(this.meta?.factions || {}).length;
        const blueprints = Object.keys(this.meta?.blueprints || {}).length;
        const mined = this.meta?.stats?.totalBlocksMined || 0;
        const placed = this.meta?.stats?.totalBlocksPlaced || 0;
        this.metaEl.textContent = `Claims: ${claims} · Factions: ${factions} · BP: ${blueprints} · ${mined}/${placed} blocs`;

        if (this.eventEl) {
            const event = this.meta?.worldEvent;
            this.eventEl.textContent = event ? `Événement: ${event.label || event.type} · ${formatTimeLeft(event.expiresAt)}` : 'Événement: aucun';
        }
    }

    getPlayerState() {
        return {
            clientId: this.identity.clientId,
            nickname: this.identity.nickname,
            color: this.identity.color,
            position: {
                x: this.player.position.x,
                y: this.player.position.y,
                z: this.player.position.z
            },
            rotation: {
                x: this.player.camera.rotation.x,
                y: this.player.camera.rotation.y,
                z: this.player.camera.rotation.z
            },
            activeBlockId: this.player.activeBlockId,
            sprinting: this.player.sprinting,
            onGround: this.player.onGround
        };
    }

    sendPlayerUpdate(force = false) {
        if (!this.socket?.connected || !this.playerId) return;

        const now = performance.now();
        if (!force && now - this.lastPlayerUpdateAt < 50) return;

        this.lastPlayerUpdateAt = now;
        this.socket.volatile.emit('player:update', this.getPlayerState());
    }

    sendBlockChange(coords, blockId, previousBlockId = null) {
        if (!this.socket?.connected) return;
        this.socket.emit('block:change', blockChangeFromCoords(coords, blockId, previousBlockId));
    }

    sendInteraction(type) {
        if (!this.socket?.connected) return;
        this.socket.emit('player:interaction', { type });
    }

    sendWorldParams(params) {
        if (!this.socket?.connected) return;

        clearTimeout(this.paramsUpdateTimeout);
        this.paramsUpdateTimeout = setTimeout(() => {
            this.socket.emit('world:params', clone(params));
        }, 200);
    }

    update(dt) {
        this.remotePlayers.update(dt);

        if (this.lastActiveBlockId !== this.player.activeBlockId) {
            this.lastActiveBlockId = this.player.activeBlockId;
            this.sendPlayerUpdate(true);
        } else {
            this.sendPlayerUpdate();
        }
    }
}
