/** Operations are deliberately confined to this project's demo database and loopback URL. */
export function localDemoSettings(environment) {
  if (environment.LOCAL_DEV_MODE !== 'true' || environment.DEMO_ENABLED !== 'true') {
    throw new Error('Команда разрешена только при LOCAL_DEV_MODE=true и DEMO_ENABLED=true.');
  }
  let database;
  let site;
  try {
    database = new URL(environment.DATABASE_URL);
    site = new URL(environment.BETTER_AUTH_URL);
  } catch {
    throw new Error('Нужны корректные DATABASE_URL и BETTER_AUTH_URL в локальном .env.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    database.hostname !== '127.0.0.1' ||
    database.port !== '55432' ||
    database.pathname !== '/student_marketplace' ||
    database.search ||
    database.hash ||
    !database.username ||
    !database.password
  ) {
    throw new Error(
      'Команда работает только с собственной БД 127.0.0.1:55432/student_marketplace.',
    );
  }
  if (
    site.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(site.hostname) ||
    site.port !== '3000' ||
    site.username ||
    site.password ||
    site.search ||
    site.hash ||
    site.pathname !== '/'
  ) {
    throw new Error('Локальная демонстрация использует только http://localhost:3000.');
  }
  if ((environment.BETTER_AUTH_SECRET?.length ?? 0) < 32) {
    throw new Error('Задайте отдельный BETTER_AUTH_SECRET длиной не менее 32 символов.');
  }
  return { database, site };
}
