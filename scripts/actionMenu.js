import './compatibilityStatus';
import './multiplayerCommandPatch';

const QUICK_ACTIONS = [
    { label: 'Resume', type: 'resume' },
    { label: 'Chat', type: 'chat' },
    { label: 'Daily', command: '/daily' },
    { label: 'Quest', command: '/quest' },
    { label: 'Claim', command: '/claim' },
    { label: 'Home', command: '/home base' },
    { label: 'Set Home', command: '/sethome base' },
    { label: 'Builds', command: '/build list' },
    { label: 'Shop', command: '/shop' },
    { label: 'Economy', command: '/economy' },
    { label: 'Party', command: '/party info' },
    { label: 'Server', command: '/server' },
    { label: 'Guide', command: '/guide' },
    { label: 'Backup', command: '/backup' }
];

export class ActionMenu {
    constructor({ player, multiplayer }) {
        this.player = player;
        this.multiplayer = multiplayer;
        this.opened = false;
        this.hasStarted = false;

        this.root = document.createElement('div');
        this.root.id = 'action-menu';
        this.root.innerHTML = `
            <button id="action-menu-toggle" type="button">MENU</button>
            <div id="action-menu-panel" aria-hidden="true">
                <div id="action-menu-title">Game Menu</div>
                <div id="action-menu-subtitle">Actions rapides, sans commandes slash</div>
                <div id="action-menu-grid"></div>
            </div>
        `;
        document.body.append(this.root);

        this.panel = this.root.querySelector('#action-menu-panel');
        this.grid = this.root.querySelector('#action-menu-grid');
        this.toggleButton = this.root.querySelector('#action-menu-toggle');
        this.renderActions();
        this.bindEvents();
    }

    renderActions() {
        QUICK_ACTIONS.forEach((action) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'action-menu-button';
            button.textContent = action.label;
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.runAction(action);
            });
            this.grid.append(button);
        });
    }

    bindEvents() {
        this.toggleButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.toggle();
        });

        document.addEventListener('keydown', (event) => {
            const target = event.target;
            if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

            if (event.code === 'KeyM' || event.code === 'Tab') {
                event.preventDefault();
                this.toggle();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement) {
                this.hasStarted = true;
                this.close();
                return;
            }

            if (this.hasStarted && !this.player.mobileControlsEnabled) {
                this.open();
            }
        });
    }

    runAction(action) {
        if (action.type === 'resume') {
            this.resume();
            return;
        }

        if (action.type === 'chat') {
            this.close();
            this.multiplayer.openChat();
            return;
        }

        if (action.command) {
            this.multiplayer.sendChatCommand(action.command);
            this.close();
        }
    }

    resume() {
        this.close();
        if (!this.player.mobileControlsEnabled) {
            this.player.controls.lock();
        }
    }

    toggle() {
        if (this.opened) this.close();
        else this.open();
    }

    open() {
        this.opened = true;
        this.root.classList.add('open');
        this.panel.setAttribute('aria-hidden', 'false');
        if (document.pointerLockElement) document.exitPointerLock();
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.style.visibility = 'hidden';
    }

    close() {
        this.opened = false;
        this.root.classList.remove('open');
        this.panel.setAttribute('aria-hidden', 'true');
    }
}
