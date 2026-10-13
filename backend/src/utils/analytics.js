function recentDays(now = new Date()) {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(now.getTime() - (6 - i) * 86400000).toISOString().slice(0, 10));
}

function dailyCounts(url) {
  if (url.dailyClicks) return url.dailyClicks;
  const counts = new Map();
  for (const click of url.clickHistory || []) {
    const date = new Date(click.timestamp).toISOString().slice(0, 10);
    counts.set(date, (counts.get(date) || 0) + 1);
  }
  return [...counts].map(([date, clicks]) => ({ date, clicks }));
}

module.exports = { recentDays, dailyCounts };
