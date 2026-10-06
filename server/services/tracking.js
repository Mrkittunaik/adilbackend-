const Visitor = require('../models/Visitor');
const Counter = require('../models/Counter');
const Event = require('../models/VisitorEvent');
const bus = require('./bus');
const { score } = require('./scoring');

async function ensureVisitor(visitorId, ua) {
  let v = await Visitor.findOne({ visitorId });
  if (!v) {
    const n = await Counter.next('visitor');
    try { v = await Visitor.create({ visitorId, code: 'VST-' + (10000 + n), ...ua }); }
    catch (e) { v = await Visitor.findOne({ visitorId }); if (!v) throw e; }
    bus.push({ type: 'NEW_VISITOR', text: 'New visitor ' + v.code });
  }
  return v;
}
async function rescore(v) { v.score = score(v); await v.save(); return v; }
async function logEvent(e) { return Event.create(e); }
const who = (v) => (v.name ? v.name : v.code || 'Visitor');
module.exports = { ensureVisitor, rescore, logEvent, who };
