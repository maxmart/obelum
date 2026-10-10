/**
 * Locality at real size: a few hundred lines, most of them repeated
 * somewhere else on the page, and a target that is ordered its own way.
 * This is where the two diff styles should come apart, if they do.
 */
import { change, count, has, inOrder, inSection, keeps, lacks, onlyTouches, type Case } from '../case.js';
import { catalogue, catalogueSvByLevel, find, schedule, svHeading, enHeading } from './catalogue.js';
import { faq, membership as m } from './club.js';

const doubleAdvJ = find('double', 'advanced', 'juniors');
const fourIntA = find('four', 'intermediate', 'adults');
const pairAdvJ = find('pair', 'advanced', 'juniors');
const singleBegA = find('single', 'beginner', 'adults');

/** Change the line starting with `line` inside the block under `heading`. */
function inBlock(text: string, heading: string, line: string, to: string): string {
  const start = text.indexOf(heading + '\n');
  if (start < 0) throw new Error(`no block ${heading}`);
  const at = text.indexOf('\n' + line, start) + 1;
  if (at <= 0) throw new Error(`no ${line} under ${heading}`);
  const end = text.indexOf('\n', at);
  return text.slice(0, at) + to + text.slice(end);
}

/** Remove the block under `heading` and the blank line after it. */
function withoutBlock(text: string, heading: string): string {
  const start = text.indexOf(heading + '\n');
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(0, start) + text.slice(end + 1);
}

const swish = '## Betala med Swish\n\nSwisha avgiften till 123 456 78 90 och ange ditt namn.\n\n';
const handbook = {
  en: [m.en, catalogue.en, faq.en].join('\n'),
  sv: [change(m.sv, ['## Öppettider', swish + '## Öppettider']), catalogueSvByLevel, faq.sv].join('\n'),
};

export const bigpages: Case[] = [
  {
    id: 'big/catalogue-one-price',
    about: 'One price changes in a 30-course catalogue where the same detail lines, and the same price, repeat in ten blocks.',
    langs: ['en', 'sv'],
    files: catalogue,
    steps: [{ verb: 'edit', lang: 'en', content: inBlock(catalogue.en, enHeading(doubleAdvJ), 'Price:', 'Price: 1 300 SEK') }],
    target: 'sv',
    checks: [
      inSection(svHeading(doubleAdvJ), /Pris: 1[\s ]?300 kr/),
      count(/^Pris: 1 200 kr$/gm, 9),
      onlyTouches([svHeading(doubleAdvJ), '/book/double-advanced-juniors']),
    ],
    reference: inBlock(catalogue.sv, svHeading(doubleAdvJ), 'Pris:', 'Pris: 1 300 kr'),
  },
  {
    id: 'big/catalogue-diverged',
    about: 'The Swedish catalogue is ordered by level, not boat, and has an intro and a course of its own; en changes one course\'s day and drops another course.',
    langs: ['en', 'sv'],
    files: { en: catalogue.en, sv: catalogueSvByLevel },
    steps: [{
      verb: 'edit', lang: 'en',
      content: withoutBlock(inBlock(catalogue.en, enHeading(fourIntA), 'Day:', 'Day: Monday 18–20'), enHeading(pairAdvJ)),
    }],
    target: 'sv',
    checks: [
      inSection(svHeading(fourIntA), /måndag 18–20/i),
      lacks(svHeading(pairAdvJ)), lacks('/book/pair-advanced-juniors'),
      keeps('## Roddmaskin – vinterträning (vuxna)'),
      keeps('Kurserna är sorterade efter nivå. Betala med Swish eller kort.'),
      count(/^## /gm, 30),
      inOrder('## Singelsculler – nybörjare (juniorer)', '## Roddmaskin', '## Åtta – fortsättning (vuxna)'),
      onlyTouches(
        [svHeading(fourIntA), '/book/four-intermediate-adults'],
        // Its detail lines repeat in the block above, so a diff may place
        // the removal in either: both are the region.
        [svHeading(find('pair', 'advanced', 'adults')), svHeading(find('double', 'advanced', 'adults'))],
      ),
    ],
    reference: withoutBlock(inBlock(catalogueSvByLevel, svHeading(fourIntA), 'Dag:', 'Dag: måndag 18–20'), svHeading(pairAdvJ)),
  },
  {
    id: 'big/schedule-one-cell',
    about: 'One cell changes in a 56-row table whose rows differ only by day, time and activity.',
    langs: ['en', 'sv'],
    files: schedule,
    steps: [{ verb: 'edit', lang: 'en', content: change(schedule.en, ['| Thursday | 18–19 | Single scull | Water |', '| Thursday | 18–19 | Eight | Water |']) }],
    target: 'sv',
    checks: [
      has(/^\| Torsdag \| 18–19 \| Åtta \| Vattnet \|$/m),
      count(/^\|/gm, 58),
      keeps('Schemat gäller från 1 april.'),
      onlyTouches(['| Torsdag | 18–19', '| Torsdag | 18–19']),
    ],
    reference: change(schedule.sv, ['| Torsdag | 18–19 | Singelsculler | Vattnet |', '| Torsdag | 18–19 | Åtta | Vattnet |']),
  },
  {
    id: 'big/handbook-scattered',
    about: 'A 400-line handbook (membership, catalogue, FAQ) where the Swedish has its own section and orders the catalogue its own way; four changes far apart.',
    langs: ['en', 'sv'],
    files: handbook,
    steps: [{
      verb: 'edit', lang: 'en',
      content: inBlock(
        change(handbook.en, ['costs 200 SEK', 'costs 250 SEK'], ['from 7 to 21', 'from 6 to 22'], ['lockers cost 100 SEK', 'lockers cost 150 SEK']),
        enHeading(singleBegA), 'Price:', 'Price: 1 250 SEK'),
    }],
    target: 'sv',
    checks: [
      inSection('## Avgifter', /250 (kr|kronor|SEK)/),
      inSection('## Öppettider', /6.{1,6}22/),
      inSection('### Finns det skåp?', /150/),
      inSection('### Får jag en nyckel till båthuset?', /100 kr/),
      inSection(svHeading(singleBegA), /Pris: 1[\s ]?250 kr/),
      count(/^Pris: 1 200 kr$/gm, 9),
      keeps(swish.trimEnd()),
      onlyTouches(
        ['Medlemskapet kostar', 'Medlemskapet kostar'],
        ['Båthuset är öppet', 'Båthuset är öppet'],
        [svHeading(singleBegA), '/book/single-beginner-adults'],
        ['Ja, ett skåp kostar', 'Ja, ett skåp kostar'],
      ),
    ],
    reference: inBlock(
      change(handbook.sv, ['200 kr per år', '250 kr per år'], ['mellan 7 och 21', 'mellan 6 och 22'], ['skåp kostar 100 kr', 'skåp kostar 150 kr']),
      svHeading(singleBegA), 'Pris:', 'Pris: 1 250 kr'),
  },
];
