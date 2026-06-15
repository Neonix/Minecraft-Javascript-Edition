import { networkInterfaces } from 'node:os';

export function getLocalNetworkUrls(port) {
    const urls = [];
    const interfaces = networkInterfaces();

    for (const entries of Object.values(interfaces)) {
        for (const entry of entries || []) {
            if (entry.family !== 'IPv4' || entry.internal) continue;
            urls.push(`http://${entry.address}:${port}`);
        }
    }

    return urls;
}

export function logLocalNetworkUrls(port) {
    const urls = getLocalNetworkUrls(port);
    if (urls.length === 0) {
        console.log('No LAN IPv4 address detected for mobile testing.');
        return;
    }

    console.log('Mobile/LAN test URLs:');
    urls.forEach((url) => console.log(`  ${url}`));
}
