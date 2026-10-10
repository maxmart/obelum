/**
 * The target is not shaped like the source: a section only it has, a
 * paragraph it split, items it merged, sections in another order, a list it
 * made a table. A good translator carries the change over and leaves the
 * target's own shape alone.
 */
import { change, count, either, has, inOrder, inSection, keeps, lacks, onlyTouches, type Case } from '../case.js';
import { membership as m } from './club.js';

const swish = '## Betala med Swish\n\nSwisha avgiften till 123 456 78 90 och ange ditt namn.\n\n';

const regatta = {
  en: '# Regatta\n\nThe regatta starts at 10:00 on Saturday. Boats launch from the north pier. Spectators can watch from the bridge, where coffee is sold.\n',
  sv: '# Regatta\n\nRegattan startar klockan 10.00 på lördag. Båtarna sjösätts från norra piren.\n\nPublik kan titta från bron, där det säljs kaffe.\n',
};

const kit = {
  en: '## What to bring\n\n- Training clothes\n- Water bottle\n- A towel\n- Shoes for the gym\n',
  sv: '## Vad du ska ta med\n\n- Träningskläder\n- Vattenflaska och handduk\n- Inneskor till gymmet\n',
};

const prices = {
  en: '## Prices\n\n- Adult: 300 SEK\n- Junior: 150 SEK\n- Family: 600 SEK\n',
  sv: '## Priser\n\n| Kategori | Pris |\n|---|---|\n| Vuxen | 300 kr |\n| Junior | 150 kr |\n| Familj | 600 kr |\n',
};

/** sv with Opening hours and Contact the other way round. */
const svSwapped = change(m.sv,
  ['## Öppettider\n\nBåthuset är öppet varje dag mellan 7 och 21 under säsongen.\n\n', ''],
  ['board@riverside.example.\n', 'board@riverside.example.\n\n## Öppettider\n\nBåthuset är öppet varje dag mellan 7 och 21 under säsongen.\n'],
);

/** sv without an Opening hours section at all. */
const svNoHours = change(m.sv, ['## Öppettider\n\nBåthuset är öppet varje dag mellan 7 och 21 under säsongen.\n\n', '']);

export const structure: Case[] = [
  {
    id: 'structure/target-extra-section',
    about: 'The target has a section no other language has, right after the paragraph that changes.',
    langs: ['en', 'sv'],
    files: { en: m.en, sv: change(m.sv, ['## Öppettider', swish + '## Öppettider']) },
    steps: [{ verb: 'edit', lang: 'en', content: change(m.en, ['Pay by card or PayPal.', 'Pay by card or PayPal. Receipts are sent by email.']) }],
    target: 'sv',
    checks: [
      keeps(swish.trimEnd()),
      has(/kvitt/i),
      // Anywhere about paying will do, the Swish section included: placing
      // the sentence is a judgement, not a line to hit.
      onlyTouches(['Betala med kort', 'Swisha avgiften']),
    ],
    reference: change(m.sv, ['## Öppettider', swish + '## Öppettider'], ['eller Swish.', 'eller Swish. Kvitton skickas via e-post.']),
  },
  {
    id: 'structure/localized-in-changed-line',
    about: 'The changed line holds a localization (PayPal became Swish); the change must keep it.',
    langs: ['en', 'sv'],
    files: { en: m.en, sv: m.sv },
    steps: [{ verb: 'edit', lang: 'en', content: change(m.en, ['Pay by card or PayPal.', 'Pay by card, PayPal or invoice.']) }],
    target: 'sv',
    checks: [has('Swish'), has(/faktura/i), lacks('PayPal'), onlyTouches(['Betala med kort', 'Betala med kort'])],
    reference: change(m.sv, ['Betala med kort eller Swish.', 'Betala med kort, Swish eller faktura.']),
  },
  {
    id: 'structure/extra-sentence-in-changed-paragraph',
    about: 'The target\'s version of the changed paragraph has a sentence of its own.',
    langs: ['en', 'sv'],
    files: { en: m.en, sv: change(m.sv, ['och klubbhuset.', 'och klubbhuset. Klubben har funnits sedan 1932.']) },
    steps: [{ verb: 'edit', lang: 'en', content: change(m.en, ['coaching and the clubhouse', 'coaching, the gym and the clubhouse']) }],
    target: 'sv',
    checks: [keeps('Klubben har funnits sedan 1932.'), has(/gym/i), onlyTouches(['Bli medlem', 'Bli medlem'])],
    reference: change(m.sv, ['träning och klubbhuset.', 'träning, gymmet och klubbhuset. Klubben har funnits sedan 1932.']),
  },
  {
    id: 'structure/split-paragraph',
    about: 'The target split one paragraph into two; the change touches both halves.',
    langs: ['en', 'sv'],
    files: regatta,
    steps: [{
      verb: 'edit', lang: 'en',
      content: change(regatta.en, ['10:00', '11:00'], ['where coffee is sold', 'where coffee and buns are sold']),
    }],
    target: 'sv',
    checks: [has(/11[.:]00/), lacks('10.00'), has(/bull/i), has(/piren\.\n\nPublik/)],
    reference: change(regatta.sv, ['10.00', '11.00'], ['det säljs kaffe', 'det säljs kaffe och bullar']),
  },
  {
    id: 'structure/merged-list-items',
    about: 'The target merged two list items into one; the source adds an item.',
    langs: ['en', 'sv'],
    files: kit,
    steps: [{ verb: 'edit', lang: 'en', content: kit.en + '- A padlock for the locker\n' }],
    target: 'sv',
    checks: [count(/^- /gm, 4), keeps('- Vattenflaska och handduk'), lacks(/^- Handduk/m), has(/^- .*(häng)?lås/im)],
    reference: kit.sv + '- Ett hänglås till skåpet\n',
  },
  {
    id: 'structure/reordered-sections',
    about: 'The target has two sections in the other order; the change is in one of them.',
    langs: ['en', 'sv'],
    files: { en: m.en, sv: svSwapped },
    steps: [{ verb: 'edit', lang: 'en', content: change(m.en, ['from 7 to 21', 'from 8 to 20']) }],
    target: 'sv',
    checks: [
      inOrder('## Kontakt', '## Öppettider'),
      inSection('## Öppettider', /8.{1,6}20/),
      onlyTouches(['Båthuset är öppet', 'Båthuset är öppet']),
    ],
    reference: change(svSwapped, ['mellan 7 och 21', 'mellan 8 och 20']),
  },
  {
    id: 'structure/list-became-table',
    about: 'The target shows as a table what the source keeps as a list; the source changes a row and adds one.',
    langs: ['en', 'sv'],
    files: prices,
    steps: [{
      verb: 'edit', lang: 'en',
      content: change(prices.en, ['Junior: 150 SEK', 'Junior: 100 SEK'], ['- Family', '- Senior: 200 SEK\n- Family']),
    }],
    target: 'sv',
    checks: [
      keeps('| Kategori | Pris |'),
      lacks(/^- /m),
      has(/^\| *Junior *\| *100 kr *\|$/m),
      has(/^\| *(Senior|Pensionär)\w* *\| *200 kr *\|$/m),
      count(/^\|/gm, 6),
    ],
    reference: change(prices.sv, ['| Junior | 150 kr |', '| Junior | 100 kr |\n| Pensionär | 200 kr |']),
  },
  {
    id: 'structure/target-lacks-section',
    about: 'The target left out a section on purpose; the source changes something inside it. Either stay without it, or add it whole; not half.',
    langs: ['en', 'sv'],
    files: { en: m.en, sv: svNoHours },
    steps: [{ verb: 'edit', lang: 'en', content: change(m.en, ['from 7 to 21', 'from 8 to 20']) }],
    target: 'sv',
    checks: [
      either('stays without the section, or has all of it',
        [lacks(/Öppettider|Båthuset/), lacks(/\b20\b/)],
        [has(/^## Öppettider/m), inSection('## Öppettider', /8.{1,6}20/)],
      ),
      keeps('Betala med kort eller Swish.'),
      keeps('Mejla styrelsen på board@riverside.example.'),
    ],
    reference: svNoHours,
  },
];
