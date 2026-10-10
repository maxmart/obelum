/**
 * The target fixed something itself, then a sibling changed the same line
 * or the same sentence. Run with --fix merged,kept: whether the target's
 * brief should show its own fix as a change to keep ('kept', how core used
 * to be) or leave it as part of the text ('merged', core now).
 *
 * The first case is the one that raised the question: a keep-this on the
 * fixed line also froze the old wording around the fix, which the sibling
 * had just changed. The second is the opposite risk: without a keep-this,
 * a wording the target chose may be translated away.
 */
import { change, count, doc, has, inOrder, keeps, lacks, onlyTouches, type Case } from '../case.js';
import { membership as m } from './club.js';

const features = {
  en: doc(`
<FeatureBox
        title="Basics"
        direction="right"
        image="/media/basics.jpg">
    Everything a club needs.
    * Member register
    * Invoicing
</FeatureBox>

<FeatureBox
        title="Advanced"
        direction="left"
        image="/media/advanced.jpg">
    We have advanced stuff.
    * Scheduling
    * Online card payments using card.
    * Referee management
</FeatureBox>
`),
  sv: doc(`
<FeatureBox
        title="Grunderna"
        direction="right"
        image="/media/basics.jpg">
    Allt en förening behöver.
    * Medlemsregister
    * Fakturering
</FeatureBox>

<FeatureBox
        title="Avancerat"
        direction="left"
        image="/media/advanced.jpg">
    Vi har avancerade grejer.
    * Schemaläggning
    * Online kortbetalningar med kort.
    * Domarhantering
</FeatureBox>
`),
};

const svFixed = change(features.sv, ['* Online kortbetalningar med kort.', '* Online kortbetalningar med kort, Klarna och Swish.']);
const svPayPal = change(m.sv, ['Betala med kort eller Swish.', 'Betala med kort eller PayPal.']);

export const fixes: Case[] = [
  {
    id: 'fix/same-line-reworded',
    about: 'sv added local payment methods to a line as a fix; en then reworded that line (dropping the doubled "card") and moved it up. The reword and the local methods both belong in the result.',
    langs: ['en', 'sv'],
    files: features,
    steps: [
      { verb: 'fix', lang: 'sv', content: svFixed },
      {
        verb: 'edit', lang: 'en',
        content: change(features.en, ['    * Scheduling\n    * Online card payments using card.\n', '    * Online payments using card.\n    * Scheduling\n']),
      },
    ],
    target: 'sv',
    checks: [
      has(/Klarna/), has(/Swish/),
      lacks(/kortbetalningar med kort/),
      inOrder('Vi har avancerade grejer.', /\* Online[^\n]*Swish/, '* Schemaläggning', '* Domarhantering'),
      count(/^ {4}\* /gm, 5),
      onlyTouches(['Vi har avancerade grejer.', '* Domarhantering']),
    ],
    reference: change(svFixed, ['    * Schemaläggning\n    * Online kortbetalningar med kort, Klarna och Swish.\n', '    * Online betalningar med kort, Klarna och Swish.\n    * Schemaläggning\n']),
  },
  {
    id: 'fix/localized-then-line-extended',
    about: 'sv replaced PayPal with Swish as a fix; en then added invoice to the same line. Swish stays, invoice arrives, PayPal does not come back.',
    langs: ['en', 'sv'],
    files: { en: m.en, sv: svPayPal },
    steps: [
      { verb: 'fix', lang: 'sv', content: m.sv },
      { verb: 'edit', lang: 'en', content: change(m.en, ['Pay by card or PayPal.', 'Pay by card, PayPal or invoice.']) },
    ],
    target: 'sv',
    checks: [has('Swish'), has(/faktura/i), lacks('PayPal'), onlyTouches(['Betala med kort', 'Betala med kort'])],
    reference: change(m.sv, ['Betala med kort eller Swish.', 'Betala med kort, Swish eller faktura.']),
  },
  {
    id: 'fix/wording-then-sentence-extended',
    about: 'sv rephrased a sentence as a fix ("Medlemsavgiften är"); en then changed the amount in that sentence and added to it. The new facts arrive; the chosen phrasing should survive.',
    langs: ['en', 'sv'],
    files: { en: m.en, sv: m.sv },
    steps: [
      { verb: 'fix', lang: 'sv', content: change(m.sv, ['Medlemskapet kostar 200 kr per år.', 'Medlemsavgiften är 200 kr per år.']) },
      { verb: 'edit', lang: 'en', content: change(m.en, ['Membership costs 200 SEK per year.', 'Membership costs 250 SEK per year, billed in January.']) },
    ],
    target: 'sv',
    checks: [
      has(/250 (kr|kronor|SEK)/), has(/januari/i), lacks('200 kr'),
      has('Medlemsavgiften'),
      keeps('Studenter betalar halva priset.'),
      onlyTouches(['Medlemsavgiften är', 'Medlemsavgiften är']),
    ],
    reference: change(m.sv, ['Medlemskapet kostar 200 kr per år.', 'Medlemsavgiften är 250 kr per år och faktureras i januari.']),
  },
  {
    id: 'fix/far-from-change',
    about: 'Control: sv fixed one paragraph, en changed another. Both modes should pass.',
    langs: ['en', 'sv'],
    files: { en: m.en, sv: m.sv },
    steps: [
      { verb: 'fix', lang: 'sv', content: change(m.sv, ['Mejla styrelsen', 'Skicka e-post till styrelsen']) },
      { verb: 'edit', lang: 'en', content: change(m.en, ['from 7 to 21', 'from 8 to 20']) },
    ],
    target: 'sv',
    checks: [keeps('Skicka e-post till styrelsen'), has(/8.{1,6}20/), onlyTouches(['Båthuset är öppet', 'Båthuset är öppet'])],
    reference: change(m.sv, ['Mejla styrelsen', 'Skicka e-post till styrelsen'], ['mellan 7 och 21', 'mellan 8 och 20']),
  },
];
