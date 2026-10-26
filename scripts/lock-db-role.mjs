import pg from 'pg';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await db.connect();
  await db.query('REVOKE ALL ON TABLE "_prisma_migrations" FROM marketplace_app');
  console.log('Application database role has no migration-table access.');
} catch {
  console.error('Failed to apply application database permissions.');
  process.exitCode = 1;
} finally {
  await db.end();
}
