# Testing Guide

## Start

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Diagnostics:

```text
http://localhost:3000/api/health
http://localhost:3000/api/status
```

## Desktop multiplayer

1. Open two browser tabs on `http://localhost:3000`.
2. Move both players.
3. Check that each tab sees the other avatar and name tag.
4. Press `T` or `Enter` and send a chat message.
5. Mine one block in tab A and confirm it changes in tab B.
6. Place one block in tab B and confirm it changes in tab A.

## Mobile test

1. Find your computer LAN IP.
2. Start the server with `npm run dev`.
3. Open `http://YOUR_LAN_IP:3000` on Android or iPhone.
4. Test joystick movement, right-side camera, `ACT`, `JUMP`, `CHAT`, and block buttons.

## In-game commands to test

```text
/testplan
/guide
/guide multi
/guide mobile
/server
/lb coins
/daily
/kit starter
/sethome base
/home base
/claim
/faction create alpha
/bank deposit 5
/market sell 50 house-build
/market list
/contract create 100 build-bridge
/contract list
/backup
```

## Expected results

- `/api/health` returns `ok: true`.
- `/api/status` shows connected players and persistent stats.
- Other players are visible as 3D avatars.
- Chat messages appear in all connected clients.
- Block changes synchronize between clients.
- Claimed chunks reject unauthorized edits.
- Commands return server messages in chat.
