/**
 * Finding the place: a small change in a long page, one of several blocks
 * that read the same, changes scattered far apart. This is where how the
 * brief shows a change should matter most.
 */
import { change, count, has, inSection, lacks, onlyTouches, type Case } from '../case.js';
import { courses, faq } from './club.js';

export const locality: Case[] = [
  {
    id: 'locality/one-change-long-page',
    about: 'One number changes deep in a 24-entry page; another answer has the same number and must not change.',
    langs: ['en', 'sv'],
    files: faq,
    steps: [{ verb: 'edit', lang: 'en', content: change(faq.en, ['lockers cost 100 SEK', 'lockers cost 150 SEK']) }],
    target: 'sv',
    checks: [
      inSection('### Finns det skåp?', /150/),
      inSection('### Får jag en nyckel till båthuset?', /100 kr/),
      onlyTouches(['Ja, ett skåp kostar', 'Ja, ett skåp kostar']),
    ],
    reference: change(faq.sv, ['skåp kostar 100 kr', 'skåp kostar 150 kr']),
  },
  {
    id: 'locality/identical-blocks',
    about: 'Three courses share identical detail lines; only the middle one\'s price changes.',
    langs: ['en', 'sv'],
    files: courses,
    steps: [{
      verb: 'edit', lang: 'en',
      content: change(courses.en, ['technique.\n\nTime: Tuesdays 18–20\nPlace: The boathouse\nPrice: 1 200 SEK', 'technique.\n\nTime: Tuesdays 18–20\nPlace: The boathouse\nPrice: 1 500 SEK']),
    }],
    target: 'sv',
    checks: [
      inSection('## Fortsättningskurs', /1[\s ]?500/),
      count(/Pris: 1 200 kr/g, 2),
      inSection('## Nybörjarkurs', 'Pris: 1 200 kr'),
      inSection('## Scullerkurs', 'Pris: 1 200 kr'),
      onlyTouches(['## Fortsättningskurs', '## Scullerkurs']),
    ],
    reference: change(courses.sv, ['teknik.\n\nTid: tisdagar 18–20\nPlats: Båthuset\nPris: 1 200 kr', 'teknik.\n\nTid: tisdagar 18–20\nPlats: Båthuset\nPris: 1 500 kr']),
  },
  {
    id: 'locality/scattered-changes',
    about: 'Four small changes spread across a 24-entry page.',
    langs: ['en', 'sv'],
    files: faq,
    steps: [{
      verb: 'edit', lang: 'en',
      content: change(faq.en,
        ['swim 200 metres', 'swim 300 metres'],
        ['Tuesdays and Thursdays', 'Tuesdays, Thursdays and Sundays'],
        ['at least one hour ahead', 'at least two hours ahead'],
        ['annual meeting in March', 'annual meeting in February'],
      ),
    }],
    target: 'sv',
    checks: [
      inSection('### Behöver jag kunna simma?', /300/),
      inSection('### Ingår träning med tränare?', /söndag/i),
      inSection('### Hur bokar jag en båt?', /två timmar|2 timmar/),
      inSection('### Vem driver klubben?', /februari/i),
      lacks('200 meter'), lacks('i mars'),
      onlyTouches(
        ['Ja, alla medlemmar', 'Ja, alla medlemmar'],
        ['Träning med tränare på', 'Träning med tränare på'],
        ['Boka i appen', 'Boka i appen'],
        ['En styrelse som väljs', 'En styrelse som väljs'],
      ),
    ],
    reference: change(faq.sv,
      ['200 meter', '300 meter'],
      ['tisdagar och torsdagar', 'tisdagar, torsdagar och söndagar'],
      ['minst en timme', 'minst två timmar'],
      ['årsmötet i mars', 'årsmötet i februari'],
    ),
  },
];
