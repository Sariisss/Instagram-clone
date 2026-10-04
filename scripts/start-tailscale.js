#!/usr/bin/env node
/**
 * Arranca Expo (Metro) anunciando la IP/host de Tailscale en vez de la IP de la LAN.
 * Así el celular se conecta por Tailscale tanto con Wi-Fi como con datos móviles.
 *
 * Uso:  npm run start:tailscale [-- --clear]
 * Host: TAILSCALE_HOST en .env (o en el entorno); si falta, usa `tailscale ip -4`.
 */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync, execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    out[m[1]] = v;
  }
  return out;
}

const fileEnv = loadEnv(path.join(root, '.env'));
const get = (k) => (process.env[k] || fileEnv[k] || '').trim();

let host = get('TAILSCALE_HOST');
if (!host || host === '100.x.y.z') {
  try {
    host = execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
  } catch {
    host = '';
  }
}
if (!host) {
  console.error('✖ No encontré el host de Tailscale.\n  Define TAILSCALE_HOST en .env (ej. 100.64.1.2 o mi-pc.tu-tailnet.ts.net)\n  o instala/inicia Tailscale para que `tailscale ip -4` funcione.');
  process.exit(1);
}

const port = get('EXPO_DEV_PORT') || '8081';
const supa = get('EXPO_PUBLIC_SUPABASE_URL');
if (!supa || supa.includes('TU-PROYECTO')) {
  console.warn('⚠ EXPO_PUBLIC_SUPABASE_URL no está configurada en .env (el app no podrá conectarse a Supabase).');
}
if (/localhost|127\.0\.0\.1|192\.168\./.test(supa)) {
  console.warn('⚠ EXPO_PUBLIC_SUPABASE_URL apunta a localhost/IP local: no funcionará por datos móviles. Usa la URL de Supabase Cloud o tu host de Tailscale.');
}

console.log(`▶ Metro anunciado en: exp://${host}:${port}`);
console.log('  (Escanea el QR o escribe esa URL en Expo Go. El celular debe tener Tailscale activo.)\n');

function resolveExpo() {
  try {
    return require.resolve('expo/bin/cli', { paths: [root] });
  } catch {
    return null;
  }
}

let expoCli = resolveExpo();
if (!expoCli) {
  console.log('⚠ `expo` no está instalado en este proyecto. Ejecutando npm install...\n');
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    console.error('✖ Ejecuta manualmente `npm install` en esta carpeta y vuelve a intentar.');
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [npmCli, 'install'], { cwd: root, stdio: 'inherit' });
  expoCli = r.status === 0 ? resolveExpo() : null;
  if (!expoCli) {
    console.error('\n✖ npm install falló o no instaló `expo`. Copia el error de arriba (las líneas "npm error") y pásamelo.');
    process.exit(1);
  }
}

const args = [expoCli, 'start', '--host', 'lan', '--port', port, ...process.argv.slice(2)];
const child = spawn(process.execPath, args, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: host },
});
child.on('exit', (code) => process.exit(code ?? 0));
