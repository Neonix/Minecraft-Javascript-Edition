import assert from 'node:assert/strict';
import {
    createQuest,
    describeQuest,
    gameState,
    getClaimKey,
    getDataStoreKey,
    grantCoins,
    parseDataStoreKey,
    slugify
} from '../server/gameState.js';

const key = getDataStoreKey(26, 12, -3);
const coords = parseDataStoreKey(key);
assert.deepEqual(coords, { x: 26, y: 12, z: -3 }, 'DataStore key roundtrip should preserve world coordinates');

assert.equal(getClaimKey(0, 0), '0:0');
assert.equal(getClaimKey(24, -1), '1:-1');
assert.equal(slugify('Hello World!'), 'hello-world');

const quest = createQuest();
assert.ok(['mine', 'place', 'earn'].includes(quest.type), 'Quest type should be supported');
assert.ok(describeQuest(quest).length > 0, 'Quest description should not be empty');

const profile = {
    coins: 0,
    quest: { type: 'earn', target: 2, progress: 0, reward: 5, createdAt: Date.now() }
};
const result = grantCoins(profile, 2);
assert.equal(profile.coins, 7, 'Earn quest should grant reward after completion');
assert.equal(result.reward, 5);
assert.equal(gameState.version >= 3, true, 'Persistent state version should be current');

console.log('Smoke test passed. Multiplayer state helpers are coherent.');
