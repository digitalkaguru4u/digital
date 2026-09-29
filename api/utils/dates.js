const { DateTime } = require('luxon');
const config = require('../config');

const TZ = config.timezone;
const now = () => DateTime.now().setZone(TZ);

/** Resolve a dashboard date filter into a {from, to} pair of JS Dates (to is exclusive). */
function resolveRange(preset = 'last_30_days', fromStr, toStr) {
  const n = now();
  const today = n.startOf('day');
  switch (preset) {
    case 'today':
      return { from: today.toJSDate(), to: today.plus({ days: 1 }).toJSDate(), preset };
    case 'yesterday':
      return { from: today.minus({ days: 1 }).toJSDate(), to: today.toJSDate(), preset };
    case 'last_7_days':
      return { from: today.minus({ days: 6 }).toJSDate(), to: today.plus({ days: 1 }).toJSDate(), preset };
    case 'this_month':
      return { from: n.startOf('month').toJSDate(), to: today.plus({ days: 1 }).toJSDate(), preset };
    case 'last_month': {
      const s = n.minus({ months: 1 }).startOf('month');
      return { from: s.toJSDate(), to: s.plus({ months: 1 }).toJSDate(), preset };
    }
    case 'all_time':
      return { from: new Date(0), to: today.plus({ days: 1 }).toJSDate(), preset };
    case 'custom': {
      const f = DateTime.fromISO(fromStr || '', { zone: TZ });
      const t = DateTime.fromISO(toStr || '', { zone: TZ });
      if (f.isValid && t.isValid && f <= t) {
        return { from: f.startOf('day').toJSDate(), to: t.startOf('day').plus({ days: 1 }).toJSDate(), preset };
      }
      return resolveRange('last_30_days');
    }
    case 'last_30_days':
    default:
      return { from: today.minus({ days: 29 }).toJSDate(), to: today.plus({ days: 1 }).toJSDate(), preset: 'last_30_days' };
  }
}

function todayBounds() {
  const s = now().startOf('day');
  return { start: s.toJSDate(), end: s.plus({ days: 1 }).toJSDate() };
}

/** Key for grouping a date into day / ISO-week / month buckets in the business timezone. */
function bucketKey(date, granularity) {
  const d = DateTime.fromJSDate(date).setZone(TZ);
  if (granularity === 'month') return d.toFormat('yyyy-MM');
  if (granularity === 'week') return d.startOf('week').toFormat('yyyy-MM-dd');
  return d.toFormat('yyyy-MM-dd');
}

function bucketList(from, to, granularity) {
  const out = [];
  let c = DateTime.fromJSDate(from).setZone(TZ);
  c = granularity === 'month' ? c.startOf('month') : granularity === 'week' ? c.startOf('week') : c.startOf('day');
  const end = DateTime.fromJSDate(to).setZone(TZ);
  const step = granularity === 'month' ? { months: 1 } : granularity === 'week' ? { weeks: 1 } : { days: 1 };
  let guard = 0;
  while (c < end && guard++ < 1000) {
    out.push(bucketKey(c.toJSDate(), granularity));
    c = c.plus(step);
  }
  return out;
}

module.exports = { TZ, now, resolveRange, todayBounds, bucketKey, bucketList };
