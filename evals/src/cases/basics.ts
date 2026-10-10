/**
 * One language changed one thing, and the target is shaped like it. The
 * floor: every translator should pass these every time.
 */
import { change, count, has, keeps, lacks, inOrder, onlyTouches, type Case } from '../case.js';
import { membership as m } from './club.js';

const base = { langs: ['en', 'sv'], files: { en: m.en, sv: m.sv }, target: 'sv' };

export const basics: Case[] = [
  {
    ...base,
    id: 'basic/number',
    about: 'A price changes in one sentence.',
    steps: [{ verb: 'edit', lang: 'en', content: change(m.en, ['costs 200 SEK', 'costs 250 SEK']) }],
    checks: [
      has(/250 (kr|kronor|SEK)/),
      lacks('200 kr'),
      keeps('Studenter betalar halva priset.'),
      onlyTouches(['Medlemskapet kostar', 'Medlemskapet kostar']),
    ],
    reference: change(m.sv, ['200 kr', '250 kr']),
  },
  {
    ...base,
    id: 'basic/add-section',
    about: 'A new section is added between two others.',
    steps: [{
      verb: 'edit', lang: 'en',
      content: change(m.en, ['## Contact', '## Parking\n\nFree parking is available behind the boathouse.\n\n## Contact']),
    }],
    checks: [
      has(/^## Parkering/m),
      has(/gratis|avgiftsfri|kostnadsfri/i),
      inOrder('## Öppettider', /^## Parkering/m, '## Kontakt'),
      onlyTouches(['Båthuset är öppet', '## Kontakt']),
    ],
    reference: change(m.sv, ['## Kontakt', '## Parkering\n\nDet finns gratis parkering bakom båthuset.\n\n## Kontakt']),
  },
  {
    ...base,
    id: 'basic/remove-section',
    about: 'A whole section is removed.',
    steps: [{
      verb: 'edit', lang: 'en',
      content: change(m.en, ['## Opening hours\n\nThe boathouse is open every day from 7 to 21 during the season.\n\n', '']),
    }],
    checks: [
      lacks('## Öppettider'),
      lacks('Båthuset'),
      count(/^## /gm, 2),
      onlyTouches(['Betala med kort', '## Kontakt']),
    ],
    reference: change(m.sv, ['## Öppettider\n\nBåthuset är öppet varje dag mellan 7 och 21 under säsongen.\n\n', '']),
  },
  {
    ...base,
    id: 'basic/rewrite',
    about: 'A paragraph is rewritten with new facts; none of the old wording survives.',
    steps: [{
      verb: 'edit', lang: 'en',
      content: change(m.en, ['Membership costs 200 SEK per year. Students pay half.',
        'Adults pay 300 SEK per year. Juniors under 18 row for free. A family membership is 600 SEK.']),
    }],
    checks: [
      has('300'), has('600'), has('18'),
      lacks('halva priset'), lacks('200 kr'),
      onlyTouches(['Medlemskapet kostar', 'Medlemskapet kostar']),
    ],
    reference: change(m.sv, ['Medlemskapet kostar 200 kr per år. Studenter betalar halva priset.',
      'Vuxna betalar 300 kr per år. Juniorer under 18 ror gratis. Ett familjemedlemskap kostar 600 kr.']),
  },
  {
    ...base,
    id: 'basic/glossary',
    about: 'A new sentence uses terms the host\'s glossary decides.',
    instructions: 'Glossary: "erg" is "roddmaskin" in Swedish, never "erg" or "ergometer". "Riverside Rowing Club" is "Riverside Roddklubb".',
    steps: [{
      verb: 'edit', lang: 'en',
      content: change(m.en, ['during the season.', 'during the season. In winter, members train on the ergs in the gym.']),
    }],
    checks: [
      has(/roddmaskin/i),
      lacks(/\berg(s|ar|en|arna)?\b|ergometer/i),
      onlyTouches(['Båthuset är öppet', 'Båthuset är öppet']),
    ],
    reference: change(m.sv, ['under säsongen.', 'under säsongen. På vintern tränar medlemmarna på roddmaskinerna i gymmet.']),
  },
];
