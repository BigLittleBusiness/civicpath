export function parseCsv(text, maxRows = 1000) {
  const lines = String(text || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };
  const parseLine = (line) => {
    const values = []; let value = ''; let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; }
      else value += char;
    }
    values.push(value.trim());
    return values;
  };
  const headers = parseLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, '_'));
  const rows = lines.slice(1, maxRows + 1).map((line) => Object.fromEntries(parseLine(line).map((value, index) => [headers[index] || `column_${index + 1}`, value])));
  return { headers, rows };
}

