import { spawn } from 'node:child_process';
const processes = [spawn(process.execPath, ['--env-file-if-exists=.env.local', '--import', 'tsx', '--watch', 'server/index.ts'], { stdio: 'inherit' }), spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' })];
const stop = () => processes.forEach(p => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
processes.forEach(p => p.on('exit', code => { stop(); process.exit(code ?? 0); }));
