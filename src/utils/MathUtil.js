// Common lightweight math helpers for vectors, clamping, and interpolation.

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function vec2(x = 0, y = 0) {
  return { x, y };
}

export function vec2Set(v, x, y) {
  v.x = x; v.y = y; return v;
}

export function vec2Add(out, a, b) {
  out.x = a.x + b.x; out.y = a.y + b.y; return out;
}

export function vec2Scale(out, a, s) {
  out.x = a.x * s; out.y = a.y * s; return out;
}

export function vec2Length(a) {
  return Math.hypot(a.x, a.y);
}

export function vec2Normalize(out, a) {
  const len = Math.hypot(a.x, a.y);
  if (len > 1e-8) { out.x = a.x / len; out.y = a.y / len; } else { out.x = 0; out.y = 0; }
  return out;
}

export function vec2MoveTowardZero(out, a, rate, dt) {
  // Apply friction-like deceleration toward zero velocity.
  const len = Math.hypot(a.x, a.y);
  if (len === 0) { out.x = 0; out.y = 0; return out; }
  const dec = rate * dt;
  if (len <= dec) { out.x = 0; out.y = 0; return out; }
  const s = (len - dec) / len;
  out.x = a.x * s; out.y = a.y * s; return out;
}

export function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

export function angleToDir(out, angleRad) {
  out.x = Math.cos(angleRad); out.y = Math.sin(angleRad); return out;
}

export function sign(n) {
  return n < 0 ? -1 : n > 0 ? 1 : 0;
}

export function aabbIntersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function aabbOverlapX(a, b) {
  // Signed penetration along X; negative means push left, positive push right
  const dx1 = (b.x + b.w) - a.x;     // distance to move A right to resolve
  const dx2 = (a.x + a.w) - b.x;     // distance to move A left to resolve (positive magnitude)
  // Choose the smaller magnitude; positive => push right, negative => push left
  return dx1 < dx2 ? +dx1 : -dx2;
}

export function aabbOverlapY(a, b) {
  const dy1 = (b.y + b.h) - a.y;     // distance to move A down to resolve
  const dy2 = (a.y + a.h) - b.y;     // distance to move A up to resolve (positive magnitude)
  return dy1 < dy2 ? +dy1 : -dy2;
}

export function circleIntersectsAabb(cx, cy, r, aabb) {
  // Clamp circle center to AABB to find closest point, compare distance.
  const nx = clamp(cx, aabb.x, aabb.x + aabb.w);
  const ny = clamp(cy, aabb.y, aabb.y + aabb.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return (dx * dx + dy * dy) <= (r * r);
}

export function circleIntersectsCircle(cx, cy, r, ox, oy, or) {
  const dx = ox - cx, dy = oy - cy;
  const rr = r + or;
  return dx * dx + dy * dy <= rr * rr;
}
