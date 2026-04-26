import dotenv from 'dotenv';
// Resolve .env relative to the script, not the CWD — caller may invoke from
// any directory (matches the pattern in server/index.js + bootstrap-drive.js).
dotenv.config({ path: new URL('../.env', import.meta.url) });

async function run() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error('GEMINI_API_KEY missing — set it in .env first.');
    process.exit(1);
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run().catch((err) => {
  console.error('list-models failed:', err?.message || err);
  process.exit(1);
});
