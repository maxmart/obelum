/**
 * Acme's homepage, where the Swedish deliberately differs from the
 * English (see acme-home.ts): a Globex Live row only Sweden has,
 * payments first, the Norwegian case study further down, a features
 * sentence that leads with Globex Live.
 *
 * Changes go both ways. English → Swedish: the change arrives, in the
 * right row wherever Swedish keeps it, and every Swedish divergence stays.
 * Swedish → English: a change to shared content arrives in English's own
 * order; a change to the Swedish-only row is not English's business.
 */
import { change, count, has, inElement, inOrder, keeps, lacks, onlyTouches, unchanged, type Check, type Case } from '../case.js';
import { en, enOrder, home, ids, page, sv, svOrder } from './acme-home.js';

const at = (id: string) => `id="${id}"`;

/** Everything Swedish does its own way, still there. */
const svDivergence: Check[] = [
  keeps(sv.streaming.trimEnd()),
  keeps('livestreaming med Globex Live, liveresultat'),
  inOrder(at(ids.payment), at(ids.ai), at(ids.support), at(ids.streaming), at(ids.app), at(ids.fjordby), at(ids.band)),
];

/** English still its own page: its order, nothing of Sweden's. */
const enShape: Check[] = [
  lacks('Globex Live'),
  inOrder(at(ids.ai), at(ids.fjordby), at(ids.support), at(ids.payment), at(ids.app), at(ids.band)),
];

const refereesEn = `<CmFeatureRow id="feat-3e1a5c77"
  eyebrow="REFEREES MADE EASY"
  title="Book and pay referees in Acme"
  ctaText="Read more about referee management"
  ctaLink="/en/domare/"
  image="/media/home/referees.webp"
  imageAlt="A referee at a youth match"
  imagePosition="right"
  bgColor="light"
>
  Assign referees to matches, let them confirm their games in the app, and pay them automatically when the tournament is over.
</CmFeatureRow>
`;
const refereesSv = `<CmFeatureRow id="feat-3e1a5c77"
  eyebrow="ENKEL DOMARHANTERING"
  title="Boka och betala domare i Acme"
  ctaText="Läs mer om domarhantering"
  ctaLink="/sv/domare/"
  image="/media/home/referees.webp"
  imageAlt="En domare på en ungdomsmatch"
  imagePosition="right"
  bgColor="light"
>
  Tillsätt domare till matcherna, låt dem bekräfta sina matcher i appen och betala dem automatiskt när turneringen är slut.
</CmFeatureRow>
`;

const files = home;
const langs = ['en', 'sv'];
/** A page with one block's text changed. */
const edited = (lang: 'en' | 'sv', key: string, ...pairs: [string, string][]) => {
  const blocks = { ...(lang === 'en' ? en : sv) } as Record<string, string>;
  blocks[key] = change(blocks[key], ...pairs);
  return page(lang, blocks, lang === 'en' ? enOrder : svOrder);
};
const block = (id: string) => [at(id), '</CmFeatureRow>'] as [string, string];

/** Both pages with text changed in some blocks, in their usual orders: the
 *  starting point for a case that needs content the base page lacks. */
function withText(mods: { en?: Record<string, [string, string][]>; sv?: Record<string, [string, string][]> }) {
  const apply = (blocks: Record<string, string>, m: Record<string, [string, string][]> = {}) => {
    const out = { ...blocks };
    for (const [key, pairs] of Object.entries(m)) out[key] = change(out[key], ...pairs);
    return out;
  };
  const e = apply(en, mods.en), s = apply(sv, mods.sv);
  return { blocks: { en: e, sv: s }, files: { en: page('en', e, enOrder), sv: page('sv', s, svOrder) } };
}

// The price: English says it once, in Pricing; Swedish also says it in its
// payments row at the top. Acme Clubs's price is another 95, and not this one.
const priced = withText({
  en: {
    columns: [['there\'s a range of optional extra services to choose from.', 'there\'s a range of optional extra services to choose from. The licence costs SEK 95 per team.']],
    sister: [['while staying easy to use.', 'while staying easy to use. Plans start at SEK 95 per month.']],
  },
  sv: {
    columns: [['många extratjänster att välja till!', 'många extratjänster att välja till! Licensen kostar 95 kr per lag.']],
    payment: [['ni får era pengar direkt.', 'ni får era pengar direkt. Betallösningen ingår i licensen på 95 kr per lag.']],
    sister: [['väldigt lättanvänt.', 'väldigt lättanvänt. Paketen börjar på 95 kr per månad.']],
  },
});

// A feature's name: English names the AI scheduler once, in the AI row;
// Swedish also names it in its features sentence. A name, so it can only be
// the one thing: an earlier version renamed "the Acme app", which the
// app row (a tournament's *own* app) made ambiguous. "Smartare
// schemaläggning" is not the name and stays.
const named = withText({
  en: {
    ai: [['special requests to consider.', 'special requests to consider. Our scheduler, SmartSchedule, solves it for you.']],
  },
  sv: {
    ai: [['vilotider och specialönskemål.', 'vilotider och specialönskemål. Vår schemaläggare SmartSchedule löser det åt er.']],
    columns: [['SMS-utskick och incheckning.', 'SMS-utskick och incheckning – och spelscheman med SmartSchedule.']],
  },
});

export const divergent: Case[] = [
  {
    id: 'acme/en-edits-shared-row',
    about: 'en extends the support row. Swedish keeps that row in another place, has a Globex Live row of its own and payments first; the change lands in the support row and nothing Swedish moves.',
    langs, files, target: 'sv',
    steps: [{ verb: 'edit', lang: 'en', content: edited('en', 'support', ['We\'re available every day to help', 'We\'re available every day – evenings and weekends included during tournament season – to help']) }],
    checks: [
      inElement(ids.support, /kväll/i), inElement(ids.support, /helg/i),
      ...svDivergence,
      onlyTouches(block(ids.support)),
    ],
    reference: edited('sv', 'support', ['Vi finns tillgängliga varje dag för', 'Vi finns tillgängliga varje dag – även kvällar och helger under turneringssäsongen – för']),
  },
  {
    id: 'acme/en-adds-row',
    about: 'en adds a referee row after the app row. Swedish gets it, after its own app row, with its ids, and keeps its own order and Globex Live row.',
    langs, files, target: 'sv',
    steps: [{ verb: 'edit', lang: 'en', content: page('en', { ...en, referees: refereesEn }, ['hero', 'section', 'ai', 'fjordby', 'support', 'payment', 'app', 'referees', 'band', 'columns', 'sister', 'youthcup']) }],
    checks: [
      count(new RegExp(at(ids.referees), 'g'), 1),
      inElement(ids.referees, /domar/i),
      inOrder(at(ids.app), at(ids.referees), at(ids.band)),
      count(/<CmFeatureRow /g, 9),
      ...svDivergence,
    ],
    reference: page('sv', { ...sv, referees: refereesSv }, ['hero', 'section', 'payment', 'ai', 'support', 'streaming', 'app', 'referees', 'fjordby', 'band', 'columns', 'sister', 'youthcup']),
  },
  {
    id: 'acme/en-adds-row-localized-link',
    about: 'Same added row, checked for one convention of this site: every Swedish link starts /sv/. The row\'s link should too; the prompt\'s "do not change URLs" pulls the other way.',
    langs, files, target: 'sv',
    steps: [{ verb: 'edit', lang: 'en', content: page('en', { ...en, referees: refereesEn }, ['hero', 'section', 'ai', 'fjordby', 'support', 'payment', 'app', 'referees', 'band', 'columns', 'sister', 'youthcup']) }],
    checks: [inElement(ids.referees, 'ctaLink="/sv/domare/"')],
    reference: page('sv', { ...sv, referees: refereesSv }, ['hero', 'section', 'payment', 'ai', 'support', 'streaming', 'app', 'referees', 'fjordby', 'band', 'columns', 'sister', 'youthcup']),
  },
  {
    id: 'acme/en-removes-row',
    about: 'en drops the Fjordby case study, which Swedish keeps further down. It goes from Swedish too, and nothing else moves.',
    langs, files, target: 'sv',
    steps: [{ verb: 'edit', lang: 'en', content: page('en', en, enOrder.filter(k => k !== 'fjordby')) }],
    checks: [
      lacks(at(ids.fjordby)), lacks('Fjordby'),
      count(/<CmFeatureRow /g, 7),
      keeps(sv.streaming.trimEnd()),
      keeps('livestreaming med Globex Live, liveresultat'),
      inOrder(at(ids.payment), at(ids.ai), at(ids.support), at(ids.streaming), at(ids.app), at(ids.band)),
      onlyTouches([at(ids.app), at(ids.band)]),
    ],
    reference: page('sv', sv, svOrder.filter(k => k !== 'fjordby')),
  },
  {
    id: 'acme/en-extends-list-sentence',
    about: 'en adds QR tickets to the features sentence. Swedish leads that sentence with Globex Live; the new feature arrives and the Swedish lead stays.',
    langs, files, target: 'sv',
    steps: [{ verb: 'edit', lang: 'en', content: edited('en', 'columns', ['SMS notifications and check-in.', 'SMS notifications, check-in and QR tickets.']) }],
    checks: [
      inElement(ids.features, /QR/),
      ...svDivergence,
      onlyTouches(['Missa inte att vi också', 'Missa inte att vi också']),
    ],
    reference: edited('sv', 'columns', ['SMS-utskick och incheckning.', 'SMS-utskick, incheckning och QR-biljetter.']),
  },
  {
    id: 'acme/en-edits-moved-row',
    about: 'en adds Apple Pay to the payments row, which Swedish has moved to the top. The change lands there and the row stays first.',
    langs, files, target: 'sv',
    steps: [{
      verb: 'edit', lang: 'en',
      content: edited('en', 'payment',
        ['title="Accept card, Klarna or Swish payments with ease"', 'title="Accept card, Klarna, Swish or Apple Pay payments with ease"'],
        ['Let teams pay by card or Klarna,', 'Let teams pay by card, Klarna or Apple Pay,']),
    }],
    checks: [
      inElement(ids.payment, /title="[^"]*Apple Pay/),
      inElement(ids.payment, /kort, Klarna eller Apple Pay|kort, Klarna och Apple Pay/),
      ...svDivergence,
      onlyTouches(block(ids.payment)),
    ],
    reference: edited('sv', 'payment',
      ['title="Ta enkelt betalt med kort, Klarna eller Swish"', 'title="Ta enkelt betalt med kort, Klarna, Swish eller Apple Pay"'],
      ['betala med kort eller Klarna', 'betala med kort, Klarna eller Apple Pay']),
  },
  {
    id: 'acme/one-change-two-places-price',
    about: 'en raises the licence price in its Pricing column, the only place English states it. Swedish states it there and in its payments row at the top; both change. Acme Clubs\'s own 95 is another price and stays.',
    langs, files: priced.files, target: 'sv',
    steps: [{ verb: 'edit', lang: 'en', content: change(priced.files.en, ['The licence costs SEK 95 per team.', 'The licence costs SEK 110 per team.']) }],
    checks: [
      inElement('text-c21f80b4', /110/),
      inElement(ids.payment, /110/),
      lacks(/95 kr per lag/),
      inElement('feat-06c9e3b8', '95 kr per månad'),
      ...svDivergence,
      onlyTouches(['Vi har en enkel prissättning', 'Vi har en enkel prissättning'], block(ids.payment)),
    ],
    reference: change(priced.files.sv, ['ingår i licensen på 95 kr per lag.', 'ingår i licensen på 110 kr per lag.'], ['Licensen kostar 95 kr per lag.', 'Licensen kostar 110 kr per lag.']),
  },
  {
    id: 'acme/one-change-two-places-rename',
    about: 'en renames its AI scheduler (SmartSchedule → AutoPlan) in the AI row, the only place English names it. Swedish names it there and in its features sentence; both change. "Smartare schemaläggning" is not the name and stays.',
    langs, files: named.files, target: 'sv',
    steps: [{ verb: 'edit', lang: 'en', content: change(named.files.en, ['Our scheduler, SmartSchedule,', 'Our scheduler, AutoPlan,']) }],
    checks: [
      inElement(ids.ai, /AutoPlan/),
      inElement(ids.features, /AutoPlan/),
      lacks('SmartSchedule'),
      count(/AutoPlan/g, 2),
      keeps('eyebrow="Smartare schemaläggning med AI"'),
      ...svDivergence,
      onlyTouches(block(ids.ai), ['Missa inte att vi också', 'Missa inte att vi också']),
    ],
    reference: change(named.files.sv, ['schemaläggare SmartSchedule löser', 'schemaläggare AutoPlan löser'], ['spelscheman med SmartSchedule.', 'spelscheman med AutoPlan.']),
  },
  {
    id: 'acme/sv-edits-shared-row',
    about: 'sv extends the AI row. English gets the change, in its own order, and nothing of Sweden\'s: no Globex Live, no payments-first.',
    langs, files, target: 'en',
    steps: [{ verb: 'edit', lang: 'sv', content: edited('sv', 'ai', ['vilotider och specialönskemål.', 'vilotider och specialönskemål. Med AI tar det minuter i stället för dagar.']) }],
    checks: [
      inElement(ids.ai, /minutes/i), inElement(ids.ai, /days/i),
      ...enShape,
      onlyTouches(block(ids.ai)),
    ],
    reference: page('en', { ...en, ai: change(en.ai, ['special requests to consider.', 'special requests to consider. With AI it takes minutes instead of days.']) }, enOrder),
  },
  {
    id: 'acme/sv-edits-own-row',
    about: 'sv edits its Globex Live row, which English never had. Nothing in English changes.',
    langs, files, target: 'en',
    steps: [{ verb: 'edit', lang: 'sv', content: edited('sv', 'streaming', ['en ny intäktskälla för cupen.', 'en ny intäktskälla för cupen, utbetald direkt till ert konto.']) }],
    checks: [...enShape, count(/<CmFeatureRow /g, 7)],
    reference: home.en,
  },
  ...harder(),
];

/**
 * Cases where the right answer depends on understanding what a change is
 * for, most of them by doing nothing at all. They exist to tell prompts
 * apart: each is somewhere an instruction like "apply the same structural
 * change" or "make equivalent additions" gives the wrong answer.
 */
function harder(): Case[] {
  const enAfter = (order: string[], blocks: Record<string, string> = en) => page('en', blocks, order);

  // English promotes payments by moving the row up; Swedish already has it first.
  const promoted = ['hero', 'section', 'payment', 'ai', 'fjordby', 'support', 'app', 'band', 'columns', 'sister', 'youthcup'];

  // Swedish says which languages support answers in; English then says it too.
  const languages = withText({ sv: { support: [['till att assistera med spelschema och rådgivning.', 'till att assistera med spelschema och rådgivning. Vi svarar på svenska, norska och engelska.']] } });

  // A row only English has: webinars held in English, for organisers abroad.
  const webinar = `<CmFeatureRow id="feat-8e2d4c61"
  eyebrow="FOR INTERNATIONAL ORGANISERS"
  title="Monthly webinars in English"
  ctaText="Sign up for the next webinar"
  ctaLink="/en/webinars/"
  image="/media/home/webinar.webp"
  imageAlt="A Acme webinar"
  imagePosition="right"
  bgColor="white"
>
  Every month we run an open webinar in English for organisers outside the Nordics, with a live walkthrough and time for questions.
</CmFeatureRow>
`;
  const withWebinar = ['hero', 'section', 'ai', 'fjordby', 'support', 'payment', 'app', 'webinar', 'band', 'columns', 'sister', 'youthcup'];
  const enWebinar = enAfter(withWebinar, { ...en, webinar });

  // An English typo, which Swedish never had.
  const typo = withText({ en: { payment: [['lands in your account right away', 'lands in you account right away']] } });

  // Klarna in two places in both languages (the payments row, the intro),
  // and in a third only Swedish has: a clause of the features sentence, about
  // paying with Klarna in the app, which is the same Klarna and nothing else.
  const klarna = withText({
    en: { section: [['From registration, payment, draws', 'From registration and payment by card, Klarna or Swish, draws']] },
    sv: {
      section: [['Från anmälning, betallösning, lottning', 'Från anmälning och betalning med kort, Klarna eller Swish, lottning']],
      columns: [['SMS-utskick och incheckning.', 'SMS-utskick och incheckning – och betalning med Klarna direkt i appen.']],
    },
  });

  // Swedish as it would be on first adopting obelum: its own page, never synced, lacking a row.
  const svOwn = page('sv', sv, svOrder.filter(k => k !== 'youthcup'));

  return [
    {
      id: 'acme/en-promotes-what-sv-already-promotes',
      about: 'en moves its payments row up the page. Swedish already has payments first, so it already does what the change is for: nothing to do.',
      langs, files, target: 'sv',
      steps: [{ verb: 'edit', lang: 'en', content: enAfter(promoted) }],
      checks: [unchanged()],
      reference: home.sv,
    },
    {
      id: 'acme/en-adds-what-sv-already-says',
      about: 'en adds that support answers in Swedish, Norwegian and English. Swedish already says so, in the same row: nothing to do.',
      langs, files: languages.files, target: 'sv',
      steps: [{ verb: 'edit', lang: 'en', content: change(languages.files.en, ['with match schedules and planning advice.', 'with match schedules and planning advice. We answer in Swedish, Norwegian and English.']) }],
      checks: [unchanged(), count(/svenska, norska och engelska/g, 1)],
      reference: languages.files.sv,
    },
    {
      id: 'acme/en-edits-en-only-row',
      about: 'en changes its webinar row, which only English has (webinars in English, for organisers abroad). Swedish has nothing it applies to.',
      langs, files: { en: enWebinar, sv: home.sv }, target: 'sv',
      steps: [{ verb: 'edit', lang: 'en', content: change(enWebinar, ['Every month we run', 'Every other week we run'], ['title="Monthly webinars in English"', 'title="Webinars in English, every other week"']) }],
      checks: [unchanged(), lacks('feat-8e2d4c61')],
      reference: home.sv,
    },
    {
      id: 'acme/en-fixes-english-typo',
      about: 'en fixes a typo of its own ("you account" → "your account"). The Swedish never had it: nothing to do.',
      langs, files: typo.files, target: 'sv',
      steps: [{ verb: 'edit', lang: 'en', content: change(typo.files.en, ['lands in you account', 'lands in your account']) }],
      checks: [unchanged()],
      reference: typo.files.sv,
    },
    {
      id: 'acme/en-drops-klarna-everywhere',
      about: 'en drops Klarna everywhere it mentions it (the payments row and the intro), so Klarna is no longer offered. Swedish loses every Klarna a reader sees, the one in its own features sentence too, while the kort-och-klarna URL and the image path, which are not text, stay.',
      langs, files: klarna.files, target: 'sv',
      steps: [{
        verb: 'edit', lang: 'en',
        content: change(klarna.files.en,
          ['title="Accept card, Klarna or Swish payments with ease"', 'title="Accept card or Swish payments with ease"'],
          ['imageAlt="Payment with Klarna in Acme"', 'imageAlt="Payment in Acme"'],
          ['Let teams pay by card or Klarna, so', 'Let teams pay by card or Swish, so'],
          ['payment by card, Klarna or Swish, draws', 'payment by card or Swish, draws']),
      }],
      checks: [
        lacks(/Klarna/),
        keeps('ctaLink="/sv/kort-och-klarna/"'),
        keeps('image="/media/home/klarna_acme-3.webp"'),
        inElement(ids.payment, /Swish/),
        inElement(ids.features, /incheckning/),
        keeps(sv.streaming.trimEnd()),
        inOrder(at(ids.payment), at(ids.ai), at(ids.support), at(ids.streaming), at(ids.app), at(ids.fjordby), at(ids.band)),
        onlyTouches(block(ids.payment), ['Missa inte att vi också', 'Missa inte att vi också'], ['id="sect-e5f6a7b8"', 'contained={true}']),
      ],
      reference: change(klarna.files.sv,
        ['betalning med kort, Klarna eller Swish, lottning', 'betalning med kort eller Swish, lottning'],
        ['title="Ta enkelt betalt med kort, Klarna eller Swish"', 'title="Ta enkelt betalt med kort eller Swish"'],
        ['imageAlt="Betalning med Klarna i Acme"', 'imageAlt="Betalning i Acme"'],
        ['betala med kort eller Klarna vilket', 'betala med kort eller Swish vilket'],
        ['SMS-utskick och incheckning – och betalning med Klarna direkt i appen.', 'SMS-utskick och incheckning.']),
    },
    {
      id: 'acme/never-synced-keeps-own',
      about: 'Swedish has never synced (first adoption): its own order, a Globex Live row only it has, and no East Africa row. It gains the East Africa row and keeps everything of its own.',
      langs, files: { en: home.en, sv: svOwn }, target: 'sv', neverSynced: ['sv'],
      steps: [],
      checks: [
        inElement('feat-f15b72a0', /Östafrika|East Africa/),
        count(/<CmFeatureRow /g, 8),
        ...svDivergence,
      ],
      reference: home.sv,
    },
  ];
}
