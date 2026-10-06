// tiny in-process pub/sub (single Render instance)
const bus = { recent: [], push(entry) { this.recent.unshift({ ...entry, at: new Date() }); if (this.recent.length > 60) this.recent.pop(); } };
module.exports = bus;
