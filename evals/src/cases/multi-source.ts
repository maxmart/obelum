/**
 * More than one language has changed: two siblings changed different things,
 * the target fixed something itself, a sibling appeared that the target has
 * never seen, two siblings disagree. And a target that does not exist yet.
 */
import { change, count, either, has, keeps, lacks, onlyTouches, type Case } from '../case.js';
import { membership as m } from './club.js';

const three = ['en', 'sv', 'de'];

export const multi: Case[] = [
  {
    id: 'multi/two-sources',
    about: 'en changed the fee and de changed the opening hours; the target needs both.',
    langs: three,
    files: m,
    steps: [
      { verb: 'edit', lang: 'en', content: change(m.en, ['costs 200 SEK', 'costs 250 SEK']) },
      { verb: 'edit', lang: 'de', content: change(m.de, ['von 7 bis 21 Uhr', 'von 8 bis 20 Uhr']) },
    ],
    target: 'sv',
    checks: [
      has(/250 (kr|kronor|SEK)/), lacks('200 kr'),
      has(/8.{1,6}20/), lacks('7 och 21'),
      onlyTouches(['Medlemskapet kostar', 'Medlemskapet kostar'], ['Båthuset är öppet', 'Båthuset är öppet']),
    ],
    reference: change(m.sv, ['200 kr', '250 kr'], ['mellan 7 och 21', 'mellan 8 och 20']),
  },
  {
    id: 'multi/target-own-fix',
    about: 'The target fixed a phrase itself since its last sync; a sibling then changed the same paragraph.',
    langs: ['en', 'sv'],
    files: { en: m.en, sv: m.sv },
    steps: [
      { verb: 'fix', lang: 'sv', content: change(m.sv, ['Mejla styrelsen', 'Skicka e-post till styrelsen']) },
      { verb: 'edit', lang: 'en', content: change(m.en, ['board@riverside.example.', 'board@riverside.example or call 08-123 45 67.']) },
    ],
    target: 'sv',
    checks: [keeps('Skicka e-post till styrelsen'), lacks('Mejla'), has('08-123 45 67'), onlyTouches(['Skicka e-post', 'Skicka e-post'])],
    reference: change(m.sv, ['Mejla styrelsen på board@riverside.example.', 'Skicka e-post till styrelsen på board@riverside.example eller ring 08-123 45 67.']),
  },
  {
    id: 'multi/new-sibling',
    about: 'A de translation appeared that the target has never seen, shown whole, beside a small en change. Only the en change needs translating.',
    langs: three,
    files: { en: m.en, sv: m.sv },
    steps: [
      { verb: 'edit', lang: 'en', content: change(m.en, ['costs 200 SEK', 'costs 250 SEK']) },
      { verb: 'edit', lang: 'de', content: change(m.de, ['kostet 200 SEK', 'kostet 250 SEK']) },
    ],
    target: 'sv',
    checks: [
      has(/250 (kr|kronor|SEK)/), lacks('200 kr'),
      keeps('Betala med kort eller Swish.'),
      onlyTouches(['Medlemskapet kostar', 'Medlemskapet kostar']),
    ],
    reference: change(m.sv, ['200 kr', '250 kr']),
  },
  {
    id: 'multi/siblings-disagree',
    about: 'en and de changed the same fee to different amounts. Either is defensible; keeping the old one, or both, is not.',
    langs: three,
    files: m,
    steps: [
      { verb: 'edit', lang: 'en', content: change(m.en, ['costs 200 SEK', 'costs 250 SEK']) },
      { verb: 'edit', lang: 'de', content: change(m.de, ['kostet 200 SEK', 'kostet 300 SEK']) },
    ],
    target: 'sv',
    checks: [
      lacks('200 kr'),
      either('one of the new amounts', [has('250'), lacks('300')], [has('300'), lacks('250')]),
      onlyTouches(['Medlemskapet kostar', 'Medlemskapet kostar']),
    ],
    reference: change(m.sv, ['200 kr', '250 kr']),
  },
  {
    id: 'new/from-scratch',
    about: 'The target does not exist yet; it is written whole from the source.',
    langs: ['en', 'sv'],
    files: { en: m.en },
    steps: [],
    target: 'sv',
    checks: [
      count(/^# /gm, 1), count(/^## /gm, 3),
      has('board@riverside.example'), has('200'),
      lacks(/Opening hours|Membership costs|Pay by/),
      has(/Medlemskap|medlem/),
    ],
    reference: m.sv,
  },
];
