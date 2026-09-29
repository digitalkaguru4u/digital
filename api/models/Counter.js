const { Schema, model } = require('mongoose');

const Counter = model('Counter', new Schema({ _id: String, seq: { type: Number, default: 0 } }), 'counters');

async function nextSeq(name) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return c.seq;
}

module.exports = { Counter, nextSeq };
