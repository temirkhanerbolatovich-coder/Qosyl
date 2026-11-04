import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

// Only this invocation's new database is writable. Never migrate the owner's database here.
const source = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(source.hostname))
  throw new Error('Local PostgreSQL required.');
const name = `student_marketplace_e2e_ui_${randomBytes(6).toString('hex')}`;
const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
const target = new URL(source);
target.pathname = `/${name}`;
const admin = new pg.Client({ connectionString: adminUrl.toString() });
const db = new pg.Client({ connectionString: target.toString() });
let created = false;
let stage = 'connect';
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  await db.connect();
  const migration = '20261029010000_student_headline';
  for (const entry of (await readdir('prisma/migrations', { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.isDirectory() && entry.name < migration) {
      stage = entry.name;
      await db.query(await readFile(`prisma/migrations/${entry.name}/migration.sql`, 'utf8'));
    }
  }
  stage = 'fixtures';
  await db.query(
    `INSERT INTO "User" (id, name, email, "updatedAt") VALUES ('migration-student', 'Тест миграции', 'migration@example.test', now())`,
  );
  await db.query(
    `INSERT INTO "StudentProfile" ("userId", bio, city, skills, "updatedAt") VALUES ('migration-student', 'Учебный опыт', 'Семей', ARRAY['Excel'], now())`,
  );
  const before = (await db.query(`SELECT to_jsonb(p) AS value FROM "StudentProfile" p`)).rows;
  await db.query(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
  assert.deepEqual(
    (await db.query(`SELECT to_jsonb(p) - 'headline' AS value FROM "StudentProfile" p`)).rows,
    before,
  );
  assert.equal((await db.query(`SELECT headline FROM "StudentProfile"`)).rows[0].headline, '');
  await db.query(`UPDATE "StudentProfile" SET headline = 'Начинающий дизайнер'`);
  assert.equal(
    (await db.query(`SELECT headline FROM "StudentProfile"`)).rows[0].headline,
    'Начинающий дизайнер',
  );
  // Rehearse the schema rollback only in this disposable database.
  const detailsBefore = (await db.query(`SELECT to_jsonb(p) AS value FROM "StudentProfile" p`))
    .rows;
  stage = 'student_details';
  await db.query(
    await readFile('prisma/migrations/20261029020000_student_details/migration.sql', 'utf8'),
  );
  assert.deepEqual(
    (
      await db.query(
        `SELECT to_jsonb(p) - ARRAY['studyYear', 'languages', 'experiences'] AS value FROM "StudentProfile" p`,
      )
    ).rows,
    detailsBefore,
  );
  assert.deepEqual(
    (await db.query(`SELECT "studyYear", languages, experiences FROM "StudentProfile"`)).rows[0],
    { studyYear: null, languages: [], experiences: [] },
  );
  await db.query(
    `UPDATE "StudentProfile" SET "studyYear" = 2, languages = ARRAY['Қазақша', 'Русский'], experiences = '[{"kind":"academic"}]'`,
  );
  assert.equal((await db.query(`SELECT "studyYear" FROM "StudentProfile"`)).rows[0].studyYear, 2);
  const linksBefore = (await db.query(`SELECT to_jsonb(p) AS value FROM "StudentProfile" p`)).rows;
  stage = 'profile_links';
  await db.query(
    await readFile('prisma/migrations/20261029030000_profile_links/migration.sql', 'utf8'),
  );
  assert.deepEqual(
    (await db.query(`SELECT to_jsonb(p) - 'profileLinks' AS value FROM "StudentProfile" p`)).rows,
    linksBefore,
  );
  assert.deepEqual(
    (await db.query(`SELECT "profileLinks" FROM "StudentProfile"`)).rows[0].profileLinks,
    [],
  );
  const visibilityBefore = (await db.query(`SELECT to_jsonb(p) AS value FROM "StudentProfile" p`))
    .rows;
  stage = 'profile_visibility';
  await db.query(
    await readFile('prisma/migrations/20261029040000_profile_visibility/migration.sql', 'utf8'),
  );
  assert.deepEqual(
    (await db.query(`SELECT to_jsonb(p) - 'hiddenFields' AS value FROM "StudentProfile" p`)).rows,
    visibilityBefore,
  );
  assert.deepEqual(
    (await db.query(`SELECT "hiddenFields" FROM "StudentProfile"`)).rows[0].hiddenFields,
    [],
  );
  stage = 'profile_avatar';
  const avatarBefore = (await db.query(`SELECT to_jsonb(p) AS value FROM "StudentProfile" p`)).rows;
  await db.query(
    await readFile('prisma/migrations/20261029050000_profile_avatar/migration.sql', 'utf8'),
  );
  assert.deepEqual(
    (await db.query(`SELECT to_jsonb(p) AS value FROM "StudentProfile" p`)).rows,
    avatarBefore,
  );
  await db.query(
    `INSERT INTO "ProfileAvatar" ("userId", bytes, revision) VALUES ('migration-student', $1, 'test')`,
    [Buffer.from('sanitized-fixture')],
  );
  assert.equal((await db.query(`SELECT "isPublic" FROM "ProfileAvatar"`)).rows[0].isPublic, false);
  await assert.rejects(
    db.query(`UPDATE "ProfileAvatar" SET bytes = $1`, [Buffer.alloc(524289)]),
    (error) => error.code === '23514',
  );

  stage = 'portfolio_cases';
  await db.query(
    `INSERT INTO "ExternalPortfolioItem" (id, "userId", title, description, url) VALUES ('legacy-case', 'migration-student', 'Старый кейс', 'Сохранённое описание', 'https://example.com/old')`,
  );
  const oldCase = (await db.query(`SELECT to_jsonb(p) AS value FROM "ExternalPortfolioItem" p`))
    .rows;
  await db.query(
    await readFile('prisma/migrations/20261029060000_portfolio_cases/migration.sql', 'utf8'),
  );
  const columns = [
    'role',
    'problem',
    'contribution',
    'period',
    'tools',
    'result',
    'links',
    'visibility',
    'publicationAllowed',
    'position',
    'revision',
  ];
  assert.deepEqual(
    (
      await db.query(`SELECT to_jsonb(p) - $1::text[] AS value FROM "ExternalPortfolioItem" p`, [
        columns,
      ])
    ).rows,
    oldCase,
  );
  assert.deepEqual(
    (await db.query(`SELECT visibility, "publicationAllowed" FROM "ExternalPortfolioItem"`))
      .rows[0],
    { visibility: 'public', publicationAllowed: true },
  );
  await db.query(
    `INSERT INTO "ExternalPortfolioItem" (id, "userId", title, url) VALUES ('new-case', 'migration-student', 'Новый кейс', '')`,
  );
  assert.deepEqual(
    (
      await db.query(
        `SELECT visibility, "publicationAllowed" FROM "ExternalPortfolioItem" WHERE id='new-case'`,
      )
    ).rows[0],
    { visibility: 'draft', publicationAllowed: false },
  );
  await assert.rejects(
    db.query(`UPDATE "ExternalPortfolioItem" SET visibility='public' WHERE id='new-case'`),
    (error) => error.code === '23514',
  );
  await db.query(`DELETE FROM "ExternalPortfolioItem" WHERE id='new-case'`);
  await db.query(
    'ALTER TABLE "ExternalPortfolioItem" ' +
      columns.map((c) => 'DROP COLUMN "' + c + '"').join(', '),
  );
  assert.deepEqual(
    (await db.query(`SELECT to_jsonb(p) AS value FROM "ExternalPortfolioItem" p`)).rows,
    oldCase,
  );
  await db.query(`DROP TABLE "ProfileAvatar"`);
  await db.query(`ALTER TABLE "StudentProfile" DROP COLUMN "hiddenFields"`);
  assert.deepEqual(
    (await db.query(`SELECT to_jsonb(p) AS value FROM "StudentProfile" p`)).rows,
    visibilityBefore,
  );
  await db.query(`ALTER TABLE "StudentProfile" DROP COLUMN "profileLinks"`);
  assert.deepEqual(
    (await db.query(`SELECT to_jsonb(p) AS value FROM "StudentProfile" p`)).rows,
    linksBefore,
  );
  await db.query(
    `ALTER TABLE "StudentProfile" DROP COLUMN "studyYear", DROP COLUMN languages, DROP COLUMN experiences`,
  );
  assert.deepEqual(
    (await db.query(`SELECT to_jsonb(p) AS value FROM "StudentProfile" p`)).rows,
    detailsBefore,
  );
  await db.query(`ALTER TABLE "StudentProfile" DROP COLUMN headline`);
  assert.deepEqual(
    (await db.query(`SELECT to_jsonb(p) AS value FROM "StudentProfile" p`)).rows,
    before,
  );
  console.log(
    'PASS: populated pre-migration schema, preserved profile data, empty default, Cyrillic update, schema rollback.',
  );
} catch (error) {
  console.error(
    `Profile migration verification failed at ${stage} (${error.code ?? error.name}); no owner data was modified.`,
  );
  process.exitCode = 1;
} finally {
  await db.end();
  if (created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
}
