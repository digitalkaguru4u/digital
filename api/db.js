const mongoose = require('mongoose');
const config = require('./config');

mongoose.set('strictQuery', true);

async function connectDB(uri = config.mongoUri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('[db] connected');
  return mongoose.connection;
}

module.exports = { connectDB, mongoose };
