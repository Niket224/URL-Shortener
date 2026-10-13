function recentDays(now = new Date()) {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(now.getTime() - (6 - i) * 86400000).toISOString().slice(0, 10));
}

function dailyCounts(url) {
  const counts = new Map();
  for (const click of url.clickHistory || []) {
    const date = new Date(click.timestamp).toISOString().slice(0, 10);
    counts.set(date, (counts.get(date) || 0) + 1);
  }
  // Each daily bucket is an authoritative total (including legacy events).
  // Override rather than add, and retain legacy fallback for missing buckets.
  for (const day of url.dailyClicks || []) counts.set(day.date, day.clicks);
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([date, clicks]) => ({ date, clicks }));
}

module.exports = { recentDays, dailyCounts };
