import { handleTravelCommand } from './playerTravel.js';
import { handleProgressionCommand } from './playerProgression.js';
import { handleSocialCommand } from './socialSystems.js';
import { sendSystemMessage } from './chatCommands.js';

export function handleExtraCommand(context) {
    if (context.message === '/2030' || context.message === '/xhelp') {
        sendSystemMessage(context.socket, '2030+: /sethome, /home, /homes, /delhome, /warp set|go|list, /party create|join|leave|tp, /bank, /daily, /achievements, /codex, /news, /announce.');
        return true;
    }

    return handleTravelCommand(context)
        || handleProgressionCommand(context)
        || handleSocialCommand(context);
}
