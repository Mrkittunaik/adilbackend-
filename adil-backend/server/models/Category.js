const { Schema, model } = require('mongoose');
// parent === null  -> top-level "group" (Office, Gaming...). Otherwise a sub-category of that group.
const CategorySchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  slug: { type: String, required: true, unique: true, index: true },
  parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  legacyId: String
}, { timestamps: true });
module.exports = model('Category', CategorySchema);
