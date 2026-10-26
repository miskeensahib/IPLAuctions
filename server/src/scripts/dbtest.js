// Proves the backend can use MongoDB Atlas: connect, then insert / read / update / delete on a throwaway
// collection (_connection_test), which is dropped afterwards. Real data is never touched.  Run: npm run db:test
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const assert = require('assert');
const { connectDb } = require('../config/db');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in server/.env. Add your MongoDB Atlas connection string first (see README).');
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) throw new Error('MONGODB_URI must start with mongodb+srv:// or mongodb://');
  if (/<password>|<user>|<cluster>/.test(uri)) throw new Error('MONGODB_URI still contains a <placeholder>. Replace it with your real values.');
  if (/localhost|127\.0\.0\.1/.test(uri)) throw new Error('MONGODB_URI points to a local database, not MongoDB Atlas.');

  await connectDb();
  const { host, name } = mongoose.connection; // never print the URI: it contains the password
  console.log(`Connected to host "${host}", database "${name}"`);
  if (!/mongodb\.net/.test(host)) console.warn('Warning: host does not look like an Atlas cluster (*.mongodb.net).');

  const col = mongoose.connection.collection('_connection_test');
  const doc = { label: 'atlas-check', n: 1, at: new Date() };

  const ins = await col.insertOne(doc);
  assert(ins.insertedId, 'insert failed');
  console.log('PASS insert');

  const found = await col.findOne({ _id: ins.insertedId });
  assert.strictEqual(found?.label, 'atlas-check', 'read-back failed');
  console.log('PASS retrieve');

  const upd = await col.updateOne({ _id: ins.insertedId }, { $set: { n: 2 } });
  assert.strictEqual(upd.modifiedCount, 1, 'update failed');
  assert.strictEqual((await col.findOne({ _id: ins.insertedId })).n, 2, 'updated value not stored');
  console.log('PASS update');

  const del = await col.deleteOne({ _id: ins.insertedId });
  assert.strictEqual(del.deletedCount, 1, 'delete failed');
  assert.strictEqual(await col.findOne({ _id: ins.insertedId }), null, 'record still exists after delete');
  console.log('PASS delete');

  await col.drop().catch(() => {});
  console.log('\nALL CHECKS PASSED: the backend can read and write your MongoDB Atlas database.');
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    const m = String(e.message);
    console.error('\nFAILED:', m.replace(/mongodb(\+srv)?:\/\/[^@\s]+@/g, 'mongodb$1://***@'));
    if (/bad auth|Authentication failed/i.test(m)) console.error('Hint: wrong database username/password (URL-encode special characters like @ : / ?).');
    else if (/ENOTFOUND|querySrv|ECONNREFUSED/i.test(m)) console.error('Hint: check the cluster address in the string and your internet connection.');
    else if (/timed out|ReplicaSetNoPrimary|Server selection/i.test(m)) console.error('Hint: Atlas is blocking you. Add your current IP in Atlas > Network Access.');
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
