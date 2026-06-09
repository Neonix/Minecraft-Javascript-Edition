import { gameState, publicMeta } from './gameState.js';

export function installDiagnostics(app, io, players) {
    app.get('/api/health', (_req, res) => {
        res.json({
            ok: true,
            service: 'minecraft-js-edition-2030',
            websocketPath: '/socket.io',
            connectedPlayers: players.size,
            uptimeSeconds: Math.round(process.uptime())
        });
    });

    app.get('/api/status', (_req, res) => {
        const meta = publicMeta();
        res.json({
            ok: true,
            connectedPlayers: players.size,
            socketClients: io.engine.clientsCount,
            blockChanges: Object.keys(gameState.data).length,
            profiles: Object.keys(gameState.profiles).length,
            claims: Object.keys(gameState.claims).length,
            factions: Object.keys(gameState.factions).length,
            blueprints: Object.keys(gameState.blueprints).length,
            spawn: gameState.spawn,
            worldEvent: gameState.worldEvent,
            stats: gameState.stats,
            meta
        });
    });
}
