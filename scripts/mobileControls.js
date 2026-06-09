function isMobileLike() {
    return window.matchMedia('(pointer: coarse), (max-width: 900px)').matches;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function makeButton(label, onPress) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-button';
    button.textContent = label;
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onPress?.();
    });
    return button;
}

export class MobileControls {
    constructor({ player, onAction, onChat }) {
        this.player = player;
        this.onAction = onAction;
        this.onChat = onChat;
        this.enabled = false;
        this.moveTouch = null;
        this.lookTouch = null;
        this.moveOrigin = { x: 0, y: 0 };
        this.lastLook = { x: 0, y: 0 };

        this.root = document.createElement('div');
        this.root.id = 'mobile-controls';
        this.root.innerHTML = '<div id="mobile-look-zone"></div><div id="mobile-stick"><div id="mobile-stick-knob"></div></div><div id="mobile-buttons"></div><div id="mobile-blocks"></div>';
        document.body.append(this.root);

        this.lookZone = this.root.querySelector('#mobile-look-zone');
        this.stick = this.root.querySelector('#mobile-stick');
        this.knob = this.root.querySelector('#mobile-stick-knob');
        this.buttons = this.root.querySelector('#mobile-buttons');
        this.blocks = this.root.querySelector('#mobile-blocks');

        this.buttons.append(
            makeButton('ACT', () => this.onAction?.()),
            makeButton('JUMP', () => {
                if (this.player.onGround) this.player.velocity.y += this.player.jumpSpeed;
            }),
            makeButton('CHAT', () => this.onChat?.())
        );

        for (let id = 0; id <= 8; id++) {
            this.blocks.append(makeButton(String(id), () => this.player.selectBlock(id)));
        }

        this.bindMovement();
        this.bindLook();
        this.refresh();
        window.addEventListener('resize', () => this.refresh());
        window.addEventListener('orientationchange', () => this.refresh());
    }

    refresh() {
        this.enabled = isMobileLike();
        this.player.mobileControlsEnabled = this.enabled;
        this.root.classList.toggle('visible', this.enabled);
    }

    bindMovement() {
        this.stick.addEventListener('touchstart', (event) => {
            const touch = event.changedTouches[0];
            if (!touch) return;
            event.preventDefault();
            this.moveTouch = touch.identifier;
            const rect = this.stick.getBoundingClientRect();
            this.moveOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            this.updateMovement(touch.clientX, touch.clientY);
        }, { passive: false });

        this.stick.addEventListener('touchmove', (event) => {
            const touch = [...event.changedTouches].find((item) => item.identifier === this.moveTouch);
            if (!touch) return;
            event.preventDefault();
            this.updateMovement(touch.clientX, touch.clientY);
        }, { passive: false });

        const stop = () => {
            this.moveTouch = null;
            this.player.input.x = 0;
            this.player.input.z = 0;
            this.knob.style.transform = 'translate(0, 0)';
        };
        this.stick.addEventListener('touchend', stop);
        this.stick.addEventListener('touchcancel', stop);
    }

    updateMovement(clientX, clientY) {
        const dx = clamp(clientX - this.moveOrigin.x, -55, 55);
        const dy = clamp(clientY - this.moveOrigin.y, -55, 55);
        const length = Math.hypot(dx, dy);
        const strength = clamp(length / 55, 0, 1);
        const nx = length > 0 ? dx / length : 0;
        const ny = length > 0 ? dy / length : 0;
        this.player.input.x = nx * strength * this.player.maxSpeed;
        this.player.input.z = -ny * strength * this.player.maxSpeed;
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    bindLook() {
        this.lookZone.addEventListener('touchstart', (event) => {
            const touch = event.changedTouches[0];
            if (!touch) return;
            event.preventDefault();
            this.lookTouch = touch.identifier;
            this.lastLook = { x: touch.clientX, y: touch.clientY };
        }, { passive: false });

        this.lookZone.addEventListener('touchmove', (event) => {
            const touch = [...event.changedTouches].find((item) => item.identifier === this.lookTouch);
            if (!touch) return;
            event.preventDefault();
            const dx = touch.clientX - this.lastLook.x;
            const dy = touch.clientY - this.lastLook.y;
            this.lastLook = { x: touch.clientX, y: touch.clientY };
            this.player.addLookDelta(dx, dy);
        }, { passive: false });

        const stop = () => { this.lookTouch = null; };
        this.lookZone.addEventListener('touchend', stop);
        this.lookZone.addEventListener('touchcancel', stop);
    }
}
