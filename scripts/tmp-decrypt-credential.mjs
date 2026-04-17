import crypto from 'node:crypto';

const token = process.env.TOKEN;
const payload = process.env.PAYLOAD;

if (!token || !payload) {
  throw new Error('TOKEN and PAYLOAD are required.');
}

const raw = Buffer.from(payload, 'base64url');
const iv = raw.subarray(0, 12);
const authTag = raw.subarray(12, 28);
const encrypted = raw.subarray(28);
const key = crypto.createHash('sha256').update(`mcp-credentials:${token}`).digest();
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag);
const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
const profile = JSON.parse(decrypted);

console.log(JSON.stringify({
  defaultConnection: profile.defaultConnection,
  total: profile.connections.length,
  connections: profile.connections.map((connection) => ({
    name: connection.name,
    type: connection.type,
    isDefault: connection.isDefault,
    label: connection.label
  }))
}, null, 2));
