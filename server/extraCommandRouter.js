import { handleTravelCommand } from './playerTravel.js';
import { handleProgressionCommand } from './playerProgression.js';
import { handleSocialCommand } from './socialSystems.js';
import { handleEconomyPlusCommand } from './economyPlus.js';
import { sendSystemMessage } from './chatCommands.js';

export function handleExtraCommand(context) {
    if (context.message === '/2030' || context.message === '/xhelp') {
        sendSystemMessage(context.socket, '2030+: /sethome, /home, /warp, /party, /bank, /daily, /achievements, /codex, /news, /kit, /market, /contract, /rep.');
        return true;
    }

    return handleTravelCommand(context)
        || handleProgressionCommand(context)
        || handleSocialCommand(context)
        || handleEconomyPlusCommand(context);
}
