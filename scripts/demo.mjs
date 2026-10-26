import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { parseEnv } from 'node:util';
import { localDemoSettings } from './local-demo-config.mjs';

function runNode(args, environment = process.env) {
  const result = spawnSync(process.execPath, args, {
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error('Подготовка остановлена: проверьте сообщение команды выше.');
}

async function portInUse() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: 3000 });
    socket.setTimeout(1500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(true);
    });
  });
}

try {
  if (!existsSync('node_modules/next/dist/bin/next')) {
    throw new Error(
      'Сначала выполните npm ci. После установки запуск не требует загрузки зависимостей.',
    );
  }
  if (await portInUse()) {
    throw new Error(
      'Порт 3000 уже занят. Если приложение открывается на http://localhost:3000, используйте его. Для новой сборки сначала завершите прежний сервер через Ctrl+C.',
    );
  }
  // The existing setup helper generates a fresh env only when it is missing.
  if (existsSync('.env')) localDemoSettings(parseEnv(readFileSync('.env', 'utf8')));
  runNode(['scripts/local-db.mjs']);
  const environment = {
    ...process.env,
    ...parseEnv(readFileSync('.env', 'utf8')),
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
  };
  localDemoSettings(environment);
  runNode(['--import', 'tsx', 'scripts/check-env.ts'], environment);
  runNode(['node_modules/prisma/build/index.js', 'generate'], environment);
  runNode(['node_modules/prisma/build/index.js', 'migrate', 'deploy'], environment);
  runNode(['--import', 'tsx', 'prisma/seed.ts'], environment);
  runNode(['node_modules/next/dist/bin/next', 'build'], environment);
  console.log(
    '\nДемонстрация: http://localhost:3000. Сервер и фоновая актуальность работают вместе. Остановить: Ctrl+C. База и данные сохраняются.\n',
  );
  runNode(['scripts/run-platform.mjs', '--hostname', '127.0.0.1', '--port', '3000'], environment);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Не удалось запустить локальную демонстрацию.',
  );
  process.exitCode = 1;
}
