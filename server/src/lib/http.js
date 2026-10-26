class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const requireAdmin = (req, _res, next) => {
  const key = process.env.ADMIN_KEY;
  if (!key) return next(new HttpError(503, 'ADMIN_KEY is not configured on the server'));
  if (req.get('x-admin-key') !== key) return next(new HttpError(401, 'Invalid admin key'));
  next();
};
module.exports = { HttpError, wrap, requireAdmin };
