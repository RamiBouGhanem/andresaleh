import { spawn } from 'node:child_process';
const backend = spawn(process.execPath, ['--experimental-sqlite', 'server.js'], {
  stdio: 'inherit', env: { ...process.env, PORT: '10001', APP_ORIGIN: 'http://127.0.0.1:5173' },
});
const forwarded = process.argv.slice(2);
const viteArgs = forwarded.length
  ? ['node_modules/vite/bin/vite.js', ...forwarded]
  : ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'];
const frontend = spawn(process.execPath, viteArgs, { stdio: 'inherit' });
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  backend.kill(); frontend.kill();
  process.exitCode = code;
}
for (const child of [backend, frontend]) {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => stop(code || 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
