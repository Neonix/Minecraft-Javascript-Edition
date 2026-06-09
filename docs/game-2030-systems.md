# Minecraft JavaScript Edition 2030 Systems

This document tracks the current multiplayer gameplay systems added on top of the original voxel sandbox.

## Server persistence

The multiplayer server saves the shared world in `data/world-state.json`.

Persisted data includes:

- block changes
- player profiles
- coins and quests
- claims
- factions
- saved blueprints
- server spawn
- active world event metadata
- global stats

The `data/` directory is intentionally ignored by Git.

## Economy and profile

Players earn coins by playing:

- mining a block: +2 coins
- placing a block: +1 coin
- periodic world reward: +1 coin while connected
- quests and events can add bonus coins

Useful commands:

```text
/profile
/quest
/top
/shop
/buy quest
/buy title <title>
/buy festival
/pay <player> <coins>
```

## Claims and factions

Players can protect chunks and collaborate through factions.

```text
/claim
/unclaim
/claims
/faction create <name>
/faction join <name>
/faction leave
/faction info [name]
```

Claimed chunks block unauthorized edits. The server sends a rollback to the client when a protected block change is denied.

## Preset structures

Players can spend coins to spawn server-defined structures:

```text
/build list
/build beacon
/build hut
/build tower
/build portal
```

These are placed server-side and broadcast to every connected player.

## Blueprints

Players can save and paste modified blocks around their current position.

```text
/blueprint save <name> [radius]
/blueprint paste <name>
/blueprint list
/blueprint delete <name>
```

Blueprints currently store block changes already known by the server. They are meant as a first UGC layer and can later evolve into a full selection/export tool.

## Spawn and world events

```text
/spawn
/setspawn
/event festival
/event expedition
/event goldrush
```

Events currently last 10 minutes:

- `festival`: grants all online players bonus coins.
- `expedition`: gives online players a cooperative mining quest.
- `goldrush`: adds bonus coin rewards while mining.

## Suggested next upgrades

- Replace JSON persistence with SQLite when the world becomes large.
- Add a visual claim overlay in the 3D world.
- Add a real blueprint selection tool instead of relying only on server-known block changes.
- Add inventories and item costs for structures.
- Add simple mobs and expedition portals.
- Add server roles/admin permissions for `/setspawn` and world-wide events.
