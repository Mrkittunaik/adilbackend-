const { Schema, model } = require('mongoose');
const Counter = model('Counter', new Schema({ _id: String, seq: { type: Number, default: 0 } }));
Counter.next = async (key) => (await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true, upsert: true })).seq;
module.exports = Counter;
