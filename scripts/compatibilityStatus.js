import '../compatibility-fixes.css';

function hasWebGL() {
    try {
        const canvas = document.createElement('canvas');
        return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch (_error) {
        return false;
    }
}

function hasLocalStorage() {
    try {
        const key = '__minecraft_js_test__';
        localStorage.setItem(key, '1');
        localStorage.removeItem(key);
        return true;
    } catch (_error) {
        return false;
    }
}

function getBrowserFlags() {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const touch = navigator.maxTouchPoints > 1;
    const ios = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && touch);
    const android = /Android/i.test(ua);
    const firefox = /Firefox/i.test(ua);
    const safari = /^((?!chrome|android).)*safari/i.test(ua);
    const chrome = /Chrome|CriOS/i.test(ua);
    return { ios, android, firefox, safari, chrome, touch };
}

function setViewportUnit() {
    document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}

function ensureViewportFit() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        document.head.append(meta);
    }

    const content = meta.getAttribute('content') || 'width=device-width, initial-scale=1.0';
    if (!content.includes('viewport-fit=cover')) {
        meta.setAttribute('content', `${content}, viewport-fit=cover`);
    }
}

function createStatusPanel(messages) {
    const panel = document.createElement('div');
    panel.id = 'compatibility-status';
    panel.innerHTML = `<strong>Compatibilité</strong><br>${messages.join('<br>')}`;
    document.body.append(panel);
    setTimeout(() => panel.classList.add('visible'), 100);
    setTimeout(() => panel.classList.remove('visible'), 8000);
}

export function installCompatibilityStatus() {
    ensureViewportFit();

    const flags = getBrowserFlags();
    document.documentElement.classList.toggle('is-ios', flags.ios);
    document.documentElement.classList.toggle('is-android', flags.android);
    document.documentElement.classList.toggle('is-touch', flags.touch);
    document.documentElement.classList.toggle('is-firefox', flags.firefox);
    document.documentElement.classList.toggle('is-safari', flags.safari);
    document.documentElement.classList.toggle('is-chrome', flags.chrome);

    setViewportUnit();
    window.addEventListener('resize', setViewportUnit);
    window.addEventListener('orientationchange', () => setTimeout(setViewportUnit, 250));

    const warnings = [];
    if (!hasWebGL()) warnings.push('WebGL indisponible: le rendu 3D risque de ne pas fonctionner.');
    if (!hasLocalStorage()) warnings.push('Stockage local bloque: identite/profil local instables.');
    if (!window.WebSocket) warnings.push('WebSocket indisponible: le multijoueur peut etre degrade.');
    if (flags.ios) warnings.push('iPhone/iPad detecte: utilise le bouton MENU et les controles tactiles.');
    if (flags.android) warnings.push('Android detecte: controles tactiles actifs.');
    if (flags.firefox) warnings.push('Firefox detecte: si le pointer lock bloque, utilise MENU ou mobile controls.');

    if (warnings.length) createStatusPanel(warnings);
}

installCompatibilityStatus();
