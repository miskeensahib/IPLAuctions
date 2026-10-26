const mongoose = require('mongoose');

async function connectDb() {
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    if (process.env.USE_MEMORY_DB === 'true' && process.env.NODE_ENV !== 'production') {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mem = await MongoMemoryServer.create();
      uri = mem.getUri('ipl_auction');
      console.warn('[db] Using in-memory MongoDB (development only, data is lost on exit)');
    } else {
      throw new Error('MONGODB_URI is not set. Copy server/.env.example to server/.env and add your MongoDB Atlas connection string.');
    }
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('[db] connected');
}
module.exports = { connectDb };
