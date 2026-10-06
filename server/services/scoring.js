// Simple website-engagement score (not an automated decision about the person)
function score(v) {
  let s = 0;
  const pv = (v.productsViewed || []).length;
  if (pv >= 1) s += 1;
  if (pv >= 2) s += 2;
  if (v.cartAdds > 0) s += 5;
  if (v.checkoutStarted) s += 8;
  if (v.waClicks > 0) s += 10;
  if (v.phone) s += 10;
  if (v.bulkEnquiries > 0) s += 20;
  return s;
}
const level = (n) => (n >= 16 ? 'HOT' : n >= 6 ? 'WARM' : 'COLD');
module.exports = { score, level };
