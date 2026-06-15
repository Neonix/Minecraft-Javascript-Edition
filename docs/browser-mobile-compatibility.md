# Browser and Mobile Compatibility

Target browsers:

- Chrome desktop
- Firefox desktop
- Safari desktop
- Chrome Android
- Safari iPhone/iPad

## Start server

```bash
npm install
npm run dev
```

Desktop URL:

```text
http://localhost:3000
```

Mobile URL:

```text
http://YOUR_COMPUTER_LAN_IP:3000
```

Example:

```text
http://192.168.1.42:3000
```

Phone and computer must be on the same Wi-Fi.

## What was added for compatibility

- Runtime WebGL check.
- Runtime localStorage check.
- Runtime WebSocket check.
- iPhone/iPad detection.
- Android detection.
- Firefox/Safari/Chrome flags on the HTML element.
- Mobile viewport height fix for Safari address bar behavior.
- iPhone safe-area CSS for notches and home indicator.
- Chat input font size set to avoid iOS zoom.
- Touch controls for mobile.
- MENU button for users without keyboard/pointer lock.

## Manual test matrix

For each browser/device:

1. Open the game.
2. Confirm no fatal compatibility warning.
3. Open MENU.
4. Press Daily or Server.
5. Open Chat.
6. Move player.
7. Mine/place a block.
8. Open a second client and verify multiplayer sync.

## In-game commands

```text
/version
/testplan
/guide mobile
/server
```

## Known limitations

- Very old browsers without WebGL cannot run the 3D game.
- iOS Safari may require a direct user tap before audio/fullscreen/pointer-like behavior.
- Mobile performance depends heavily on device GPU and world size.
