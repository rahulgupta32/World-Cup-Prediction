const fs = require('fs');
const path = require('path');

const mode = process.argv[2];

if (mode !== 'sqlite' && mode !== 'postgres') {
  console.error('Usage: node toggle-db.js [sqlite|postgres]');
  process.exit(1);
}

const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
const envPath = path.join(__dirname, '.env');

// Read schema
let schema = fs.readFileSync(schemaPath, 'utf8');

// Read env
let env = fs.readFileSync(envPath, 'utf8');

if (mode === 'sqlite') {
  console.log('Switching to SQLite configuration...');
  schema = schema.replace(/provider\s*=\s*"postgresql"/g, 'provider = "sqlite"');
  env = env.replace(/DATABASE_URL\s*=\s*".*"/g, 'DATABASE_URL="file:./dev.db"');
} else {
  console.log('Switching to PostgreSQL configuration...');
  schema = schema.replace(/provider\s*=\s*"sqlite"/g, 'provider = "postgresql"');
  env = env.replace(/DATABASE_URL\s*=\s*".*"/g, 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/worldcup?schema=public"');
}

fs.writeFileSync(schemaPath, schema, 'utf8');
fs.writeFileSync(envPath, env, 'utf8');

console.log('Files updated. Please run:');
console.log('  npx prisma generate');
if (mode === 'sqlite') {
  console.log('  npx prisma db push');
} else {
  console.log('  npx prisma migrate dev');
}
