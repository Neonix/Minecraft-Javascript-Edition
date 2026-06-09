import { handleTravelCommand } from './playerTravel.js';
import { handleProgressionCommand } from './playerProgression.js';
import { handleSocialCommand } from './socialSystems.js';
import { handleEconomyPlusCommand } from './economyPlus.js';
import { sendSystemMessage } from './chatCommands.js';

export function handleExtraCommand(context) {
    if (context.message === '/2030' || context.message === '/xhelp') {
        sendSystemMessage(context.socket, '2030+: /sethome, /home, /warp, /party, /bank, /daily, /achievements, /codex, /news, /kit, /market, /contract, /rep, /economy, /backup.');
        return true;
    }

    if (context.message === '/economy') {
        sendSystemMessage(context.socket, 'Economy+: /kit starter|builder|explorer, /market list|sell|buy|cancel, /contract list|create|accept|complete, /rep [player].');
        return true;
    }

    if (context.message === '/backup') {
        context.saveWorldState().then(() => sendSystemMessage(context.socket, 'Backup serveur sauvegarde.'));
        return true;
    }

    return handleTravelCommand(context)
        || handleProgressionCommand(context)
        || handleSocialCommand(context)
        || handleEconomyPlusCommand(context);
}
