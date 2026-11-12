import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { X509Certificate } from 'node:crypto';
import { createCA, createCert } from 'mkcert';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = new URL('../.cert/', import.meta.url);
const read = name => readFile(new URL(name, directory), 'utf8');
const save = (name, value) => writeFile(new URL(name, directory), value, { mode: 0o600 });
const addresses = [...new Set(Object.values(networkInterfaces()).flat()
  .filter(item => item && !item.internal && item.family === 'IPv4').map(item => item.address))];
const domains = ['localhost', '127.0.0.1', '::1', ...addresses];
await mkdir(directory, { recursive: true, mode: 0o700 });
const valid = pem => Date.parse(new X509Certificate(pem).validTo) > Date.now() + 86400000;
let ca;
try {
  ca = { key: await read('ca.key'), cert: await read('dartvision-ca.crt') };
  if (!valid(ca.cert)) throw new Error('Expired CA');
} catch (error) {
  if (error.code !== 'ENOENT' && error.message !== 'Expired CA') throw error;
  ca = await createCA({ organization: 'DartVision Local Development', countryCode: 'NL', state: 'Local', locality: 'Local', validity: 3650 });
  await save('ca.key', ca.key);
  await save('dartvision-ca.crt', ca.cert);
}
let certificate;
try {
  certificate = { key: await read('server.key'), cert: await read('server.crt') };
  const info = JSON.parse(await read('domains.json'));
  if (!valid(certificate.cert) || JSON.stringify(info) !== JSON.stringify(domains) || await read('issuer.crt') !== ca.cert) throw new Error('Renew certificate');
} catch (error) {
  if (error.code !== 'ENOENT' && error.message !== 'Renew certificate') throw error;
  certificate = await createCert({ ca, domains, validity: 365 });
  await save('server.key', certificate.key);
  await save('server.crt', certificate.cert);
  await save('domains.json', JSON.stringify(domains));
  await save('issuer.crt', ca.cert);
}
const server = await createServer({ root, server: {
  host: '0.0.0.0', port: 5173, strictPort: true,
  https: { key: certificate.key, cert: certificate.cert + ca.cert },
  fs: { deny: ['**/.cert/**', '**/.git/**', '**/.env*', '**/*.key'] }
} });
await server.listen();
console.log('\nDartVision op je pc: https://localhost:5173');
for (const address of addresses) console.log(`Telefoon (zelfde wifi): https://${address}:5173`);
console.log('\nVertrouw eenmalig .cert/dartvision-ca.crt op je pc en telefoon. Zie README.md.');
console.log('Stoppen: Ctrl+C\n');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await server.close();
  process.exit(0);
});
