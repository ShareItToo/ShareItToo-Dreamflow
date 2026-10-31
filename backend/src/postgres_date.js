function pad(value) {
  return String(value).padStart(2, '0');
}

export function postgresDateText(value) {
  let text;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('invalid_postgres_date');
    text = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  } else {
    text = typeof value === 'string' ? value.slice(0, 10) : '';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
  if (!match) throw new Error('invalid_postgres_date');
  const probe = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  ));
  if (probe.getUTCFullYear() !== Number(match[1])
      || probe.getUTCMonth() + 1 !== Number(match[2])
      || probe.getUTCDate() !== Number(match[3])) {
    throw new Error('invalid_postgres_date');
  }
  return text;
}
