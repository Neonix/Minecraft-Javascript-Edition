import { MultiplayerClient } from './multiplayer';

MultiplayerClient.prototype.sendChatCommand = function sendChatCommand(command) {
    const message = String(command || '').trim();
    if (!message || !this.socket?.connected) {
        this.addChatLine?.('Menu', 'Serveur indisponible pour cette action.', true);
        return;
    }

    this.socket.emit('chat:message', { message });
};
