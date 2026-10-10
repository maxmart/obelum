/**
 * What is code and what is text: front matter, MDX props, code blocks,
 * tables, line endings, and changes that move or rewrap rather than reword.
 */
import { change, count, crlf, doc, has, inOrder, keeps, lacks, onlyTouches, sameWords, type Case } from '../case.js';
import { membership as m } from './club.js';

const fees = {
  en: doc(`
---
title: Membership fees
slug: fees
updated: 2026-01-10
---

# Membership fees

Membership costs 200 SEK per year.
`),
  sv: doc(`
---
title: Medlemsavgifter
slug: avgifter
updated: 2026-01-10
---

# Medlemsavgifter

Medlemskapet kostar 200 kr per år.
`),
};

const home = {
  en: doc(`
<Hero id="top" image="/img/boats.jpg" title="Row with us" />

<Card id="plans" title="See our plans" href="/pricing">
  Pick the membership that suits you.
</Card>
`),
  sv: doc(`
<Hero id="top" image="/img/boats.jpg" title="Ro med oss" />

<Card id="plans" title="Se våra medlemskap" href="/sv/priser">
  Välj det medlemskap som passar dig.
</Card>
`),
};

const install = {
  en: doc(`
## Install

Run this to install the booking app:

\`\`\`sh
# install dependencies
npm install rowbook@2
\`\`\`
`),
  sv: doc(`
## Installera

Kör detta för att installera bokningsappen:

\`\`\`sh
# installera beroenden
npm install rowbook@2
\`\`\`
`),
};

const schedule = {
  en: '## Schedule\n\n| Day | Time |\n|-----|------|\n| Monday | 18–20 |\n| Wednesday | 18–20 |\n',
  sv: '## Schema\n\n| Dag | Tid |\n|-----|-----|\n| Måndag | 18–20 |\n| Onsdag | 18–20 |\n',
};

const news = {
  en: '# News\n\nThe club has bought two new eights, which arrive\nin April. They will be named after our founders\nand christened at the spring party.\n',
  sv: '# Nyheter\n\nKlubben har köpt två nya åttor, som kommer\ni april. De ska döpas efter våra grundare\nvid vårfesten.\n',
};

const crlfSv = m.sv.replace(/\n/g, '\r\n');

export const formats: Case[] = [
  {
    id: 'format/frontmatter',
    about: 'Front matter: the title is text, the date is data, and the target\'s slug is its own.',
    langs: ['en', 'sv'],
    files: fees,
    steps: [{
      verb: 'edit', lang: 'en',
      content: change(fees.en,
        ['title: Membership fees', 'title: Membership and fees'],
        ['# Membership fees', '# Membership and fees'],
        ['updated: 2026-01-10', 'updated: 2026-09-01']),
    }],
    target: 'sv',
    checks: [
      keeps('slug: avgifter'),
      has('updated: 2026-09-01'), lacks('2026-01-10'),
      has(/^title: Medlemskap (och|&) avgifter$/m),
      has(/^# Medlemskap (och|&) avgifter$/m),
      count(/^---$/gm, 2),
    ],
    reference: change(fees.sv,
      ['title: Medlemsavgifter', 'title: Medlemskap och avgifter'],
      ['# Medlemsavgifter', '# Medlemskap och avgifter'],
      ['updated: 2026-01-10', 'updated: 2026-09-01']),
  },
  {
    id: 'format/mdx-props',
    about: 'MDX: a text prop and an image path change; the target\'s localized href and the ids stay.',
    langs: ['en', 'sv'],
    files: home,
    steps: [{
      verb: 'edit', lang: 'en',
      content: change(home.en, ['/img/boats.jpg', '/img/eights.jpg'], ['title="See our plans"', 'title="See plans and prices"']),
    }],
    target: 'sv',
    checks: [
      has('image="/img/eights.jpg"'), lacks('/img/boats.jpg'),
      keeps('href="/sv/priser"'), keeps('<Card id="plans"'), keeps('<Hero id="top"'),
      has(/<Card id="plans" title="[^"]*pris[^"]*"/i),
      keeps('title="Ro med oss"'),
    ],
    reference: change(home.sv, ['/img/boats.jpg', '/img/eights.jpg'], ['title="Se våra medlemskap"', 'title="Se medlemskap och priser"']),
  },
  {
    id: 'format/code-block',
    about: 'A command in a code block changes; the target\'s translated comment in the block stays.',
    langs: ['en', 'sv'],
    files: install,
    steps: [{ verb: 'edit', lang: 'en', content: change(install.en, ['npm install rowbook@2', 'npm install rowbook@3 --save']) }],
    target: 'sv',
    checks: [has('npm install rowbook@3 --save'), lacks('rowbook@2'), keeps('# installera beroenden'), onlyTouches(['npm install', 'npm install'])],
    reference: change(install.sv, ['rowbook@2', 'rowbook@3 --save']),
  },
  {
    id: 'format/table-row',
    about: 'A row is added to a table.',
    langs: ['en', 'sv'],
    files: schedule,
    steps: [{ verb: 'edit', lang: 'en', content: schedule.en + '| Saturday | 9–12 |\n' }],
    target: 'sv',
    checks: [has(/^\| *Lördag *\| *9–12 *\|$/m), count(/^\|/gm, 5), inOrder('Onsdag', 'Lördag'), onlyTouches(['| Onsdag', '| Onsdag'])],
    reference: schedule.sv + '| Lördag | 9–12 |\n',
  },
  {
    id: 'format/moved-section',
    about: 'The source moves a section without changing a word; the target should move it too, not copy it.',
    langs: ['en', 'sv'],
    files: { en: m.en, sv: m.sv },
    steps: [{
      verb: 'edit', lang: 'en',
      content: change(m.en,
        ['## Opening hours\n\nThe boathouse is open every day from 7 to 21 during the season.\n\n', ''],
        ['board@riverside.example.\n', 'board@riverside.example.\n\n## Opening hours\n\nThe boathouse is open every day from 7 to 21 during the season.\n']),
    }],
    target: 'sv',
    checks: [
      inOrder('## Kontakt', '## Öppettider'),
      count(/^## Öppettider/gm, 1), count(/^## Kontakt/gm, 1),
      keeps('Båthuset är öppet varje dag mellan 7 och 21 under säsongen.'),
      keeps('Mejla styrelsen på board@riverside.example.'),
    ],
    reference: change(m.sv,
      ['## Öppettider\n\nBåthuset är öppet varje dag mellan 7 och 21 under säsongen.\n\n', ''],
      ['board@riverside.example.\n', 'board@riverside.example.\n\n## Öppettider\n\nBåthuset är öppet varje dag mellan 7 och 21 under säsongen.\n']),
  },
  {
    id: 'format/reflow',
    about: 'The source only rewraps a paragraph. Nothing to translate; the target\'s words must not change.',
    langs: ['en', 'sv'],
    files: news,
    steps: [{ verb: 'edit', lang: 'en', content: change(news.en, ['arrive\nin April. They will be named after our founders\nand', 'arrive in April. They will be named after our founders and']) }],
    target: 'sv',
    checks: [sameWords()],
    reference: news.sv,
  },
  {
    id: 'format/crlf',
    about: 'The target uses CRLF line endings, the source LF; edits must keep CRLF.',
    langs: ['en', 'sv'],
    files: { en: m.en, sv: crlfSv },
    steps: [{
      verb: 'edit', lang: 'en',
      content: change(m.en, ['costs 200 SEK', 'costs 250 SEK'], ['Email the board', 'Email or call the board']),
    }],
    target: 'sv',
    checks: [crlf(), has(/250 (kr|kronor|SEK)/), lacks('200 kr'), has(/ring/i)],
    reference: change(crlfSv, ['200 kr', '250 kr'], ['Mejla styrelsen', 'Mejla eller ring styrelsen']),
  },
];
