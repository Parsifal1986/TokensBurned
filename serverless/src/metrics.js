function finite(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function d1Meta(results) {
  const list = Array.isArray(results) ? results : [results];
  return list.reduce((total, result) => ({
    rows_read: total.rows_read + finite(result?.meta?.rows_read),
    rows_written: total.rows_written + finite(result?.meta?.rows_written),
    changes: total.changes + finite(result?.meta?.changes),
  }), { rows_read: 0, rows_written: 0, changes: 0 });
}

export function logMetric(env, event, fields = {}) {
  if (env?.OBSERVABILITY_LOGS !== "true") return;
  console.log(JSON.stringify({
    service: "tokensburned-api",
    event,
    ...fields,
  }));
}
