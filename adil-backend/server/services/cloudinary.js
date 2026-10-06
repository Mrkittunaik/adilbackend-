const cloudinary = require('cloudinary').v2;
const env = require('../config/env');
cloudinary.config({ ...env.cloudinary, secure: true });
const configured = () => !!(env.cloudinary.cloud_name && env.cloudinary.api_key && env.cloudinary.api_secret);

function upload(buffer, { resourceType = 'image', folder = 'adil-furnitures/products' } = {}) {
  if (!configured()) return Promise.reject(Object.assign(new Error('Cloudinary is not configured on the server'), { status: 503 }));
  return new Promise((resolve, reject) => {
    const opts = { folder, resource_type: resourceType };
    if (resourceType === 'image') opts.transformation = [{ width: 2000, crop: 'limit', quality: 'auto', fetch_format: 'auto' }];
    cloudinary.uploader.upload_stream(opts, (err, r) => {
      if (err) return reject(err);
      resolve({
        url: r.secure_url, publicId: r.public_id, resourceType,
        thumb: resourceType === 'video' ? r.secure_url.replace(/\.\w+$/, '.jpg').replace('/upload/', '/upload/so_0,w_600,c_fill/') : r.secure_url.replace('/upload/', '/upload/c_fill,w_400,h_400,q_auto,f_auto/')
      });
    }).end(buffer);
  });
}
async function destroy(publicId, resourceType = 'image') {
  if (!configured() || !publicId) return;
  try { await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true }); } catch (e) { console.warn('[cloudinary] destroy failed', publicId, e.message); }
}
// Insert delivery transformations (auto format/quality + width) into a Cloudinary URL
function optimize(url, w = 800) {
  if (!url || !/res\.cloudinary\.com/.test(url) || !url.includes('/upload/')) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,c_limit,w_${w}/`);
}
module.exports = { upload, destroy, optimize, configured };
