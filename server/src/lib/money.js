// All money is stored as integer lakhs (100 lakh = 1 Cr) to avoid float errors.
const increment = (cur) => (cur < 100 ? 5 : cur < 200 ? 10 : cur < 500 ? 20 : 25);
const nextBid = (cur, base) => (cur > 0 ? cur + increment(cur) : base);
const BASE_SLABS = [30, 50, 75, 100, 150, 200];
// Estimated base when no official base price is known: highest IPL slab not above the final price.
const estimateBase = (price) => {
  const fit = BASE_SLABS.filter((s) => s <= price);
  return fit.length ? fit[fit.length - 1] : 30;
};
module.exports = { increment, nextBid, estimateBase, BASE_SLABS };
