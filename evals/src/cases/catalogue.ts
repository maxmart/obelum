/**
 * Pages at real size, generated: a course catalogue of 30 blocks whose
 * detail lines repeat all over, and a weekly schedule of 56 rows. The
 * Swedish can be ordered differently and carry blocks of its own.
 */
const boats = [
  { key: 'eight', en: 'Eight', sv: 'Åtta', enAbout: 'Learn to row in an eight together with seven others.', svAbout: 'Lär dig ro i en åtta tillsammans med sju andra.' },
  { key: 'four', en: 'Four', sv: 'Fyra', enAbout: 'Row in a four, with or without a cox.', svAbout: 'Ro i en fyra, med eller utan styrman.' },
  { key: 'pair', en: 'Pair', sv: 'Tvåa', enAbout: 'Two rowers, one oar each: timing is everything.', svAbout: 'Två roddare med var sin åra: takten är allt.' },
  { key: 'double', en: 'Double', sv: 'Dubbelsculler', enAbout: 'Two scullers in a double, two oars each.', svAbout: 'Två roddare i dubbelsculler, med två åror var.' },
  { key: 'single', en: 'Single', sv: 'Singelsculler', enAbout: 'Just you and a single scull.', svAbout: 'Bara du och en singelsculler.' },
];
const levels = [
  { key: 'beginner', en: 'beginner', sv: 'nybörjare', enDay: 'Tuesday 18–20', svDay: 'tisdag 18–20', price: 1200 },
  { key: 'intermediate', en: 'intermediate', sv: 'fortsättning', enDay: 'Wednesday 18–20', svDay: 'onsdag 18–20', price: 1400 },
  { key: 'advanced', en: 'advanced', sv: 'avancerad', enDay: 'Thursday 18–20', svDay: 'torsdag 18–20', price: 1600 },
];
const groups = [
  { key: 'adults', en: 'adults', sv: 'vuxna', junior: false },
  { key: 'juniors', en: 'juniors', sv: 'juniorer', junior: true },
];

const money = (n: number) => `${Math.floor(n / 1000)} ${String(n % 1000).padStart(3, '0')}`;

interface Course { boat: typeof boats[number]; level: typeof levels[number]; group: typeof groups[number] }

/** Boat, then level, then group: the order en uses. */
const allCourses: Course[] = boats.flatMap(boat => levels.flatMap(level => groups.map(group => ({ boat, level, group }))));

export const slug = (c: Course) => `${c.boat.key}-${c.level.key}-${c.group.key}`;
export const enHeading = (c: Course) => `## ${c.boat.en} – ${c.level.en} (${c.group.en})`;
export const svHeading = (c: Course) => `## ${c.boat.sv} – ${c.level.sv} (${c.group.sv})`;

function enBlock(c: Course): string {
  const price = c.level.price - (c.group.junior ? 400 : 0);
  return [
    enHeading(c), '', c.boat.enAbout, '',
    `Boat: ${c.boat.en.toLowerCase()}`, `Level: ${c.level.en}`, `Group: ${c.group.en}`,
    `Day: ${c.group.junior ? 'Saturday 10–12' : c.level.enDay}`, 'Place: The boathouse',
    `Price: ${money(price)} SEK`, `[Book a place](/book/${slug(c)})`, '',
  ].join('\n');
}

function svBlock(c: Course): string {
  const price = c.level.price - (c.group.junior ? 400 : 0);
  return [
    svHeading(c), '', c.boat.svAbout, '',
    `Båt: ${c.boat.sv.toLowerCase()}`, `Nivå: ${c.level.sv}`, `Grupp: ${c.group.sv}`,
    `Dag: ${c.group.junior ? 'lördag 10–12' : c.level.svDay}`, 'Plats: Båthuset',
    `Pris: ${money(price)} kr`, `[Boka plats](/book/${slug(c)})`, '',
  ].join('\n');
}

export const find = (boat: string, level: string, group: string) =>
  allCourses.find(c => c.boat.key === boat && c.level.key === level && c.group.key === group)!;

export const catalogue = {
  en: '# Course catalogue\n\n' + allCourses.map(enBlock).join('\n'),
  sv: '# Kurskatalog\n\n' + allCourses.map(svBlock).join('\n'),
};

/** A Swedish block no other language has. */
const winterErg = [
  '## Roddmaskin – vinterträning (vuxna)', '',
  'Håll formen över vintern på roddmaskinerna i gymmet.', '',
  'Båt: ingen', 'Nivå: alla', 'Grupp: vuxna', 'Dag: måndag 18–19', 'Plats: Gymmet',
  'Pris: 600 kr', '[Boka plats](/sv/boka/vinter)', '',
].join('\n');

/** The Swedish catalogue ordered by level rather than boat, with an intro
 *  line and a winter course of its own among the beginners. */
export const catalogueSvByLevel = '# Kurskatalog\n\nKurserna är sorterade efter nivå. Betala med Swish eller kort.\n\n' + levels.map(level => {
  const blocks = allCourses.filter(c => c.level === level).map(svBlock);
  if (level.key === 'beginner') blocks.push(winterErg);
  return blocks.join('\n');
}).join('\n');

// ── schedule ──────────────────────────────────────────────────────────────

const days = [['Monday', 'Måndag'], ['Tuesday', 'Tisdag'], ['Wednesday', 'Onsdag'], ['Thursday', 'Torsdag'], ['Friday', 'Fredag'], ['Saturday', 'Lördag'], ['Sunday', 'Söndag']];
const slots = ['06–07', '07–08', '12–13', '16–17', '17–18', '18–19', '19–20', '20–21'];
export const activities = [
  ['Rowing machine', 'Roddmaskin', 'Gym', 'Gymmet'],
  ['Eight', 'Åtta', 'Water', 'Vattnet'],
  ['Four', 'Fyra', 'Water', 'Vattnet'],
  ['Single scull', 'Singelsculler', 'Water', 'Vattnet'],
  ['Strength', 'Styrka', 'Gym', 'Gymmet'],
];

const rows = (sv: boolean) => days.flatMap((day, d) => slots.map((slot, s) => {
  const [enA, svA, enP, svP] = activities[(d + s) % activities.length];
  return sv ? `| ${day[1]} | ${slot} | ${svA} | ${svP} |` : `| ${day[0]} | ${slot} | ${enA} | ${enP} |`;
}));

export const schedule = {
  en: '# Weekly schedule\n\n| Day | Time | Activity | Where |\n|-----|------|----------|-------|\n' + rows(false).join('\n') + '\n',
  sv: '# Veckoschema\n\n| Dag | Tid | Aktivitet | Var |\n|-----|-----|-----------|-----|\n' + rows(true).join('\n') + '\n\nSchemat gäller från 1 april.\n',
};
