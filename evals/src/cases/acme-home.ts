/**
 * A real product homepage (a tournament system's), less its logo grid and
 * testimonials, with every product, partner, place and person name replaced
 * by a made-up one: Acme, Globex Live, Acme Clubs, Fjordby, Ola Nordvik, the
 * Lakeside Youth Cup. Prices and the payment details in the cases are made up
 * too. Card, Klarna, Swish, PayPal and Apple Pay are public payment methods
 * and keep their names.
 *
 * The English is the page as it stands. The Swedish is made to diverge the
 * way a Swedish editor might: Globex Live streaming promoted in a row of its
 * own, which only Sweden has; payments (card, Klarna, Swish) moved to the
 * top, because in Sweden that is what sells; the Norwegian case study moved
 * down; and the features sentence leading with Globex Live.
 *
 * Blocks are kept apart so each language's page is its own order of them.
 */
const frontmatter = {
  en: '---\nlayout: "@/layouts/LangLayout.astro"\ntitle: Homepage\n---\n',
  sv: "---\nlayout: '@/layouts/LangLayout.astro'\ntitle: Startsidan\n---\n",
};

const imports = `import { CmBandHeading } from '@acme/blocks/CmBandHeading';
import { CmButton } from '@acme/blocks/CmButton';
import { CmColumn, CmColumns } from '@acme/blocks/CmColumns';
import { CmFeatureRow } from '@acme/blocks/CmFeatureRow';
import { CmHero } from '@acme/blocks/CmHero';
import { CmSection } from '@acme/blocks/CmSection';
import { TextBlock } from '@acme/blocks/TextBlock';
`;

export const ids = {
  ai: 'feat-2c8d91e4',
  fjordby: 'feat-7f04b3a9',
  support: 'feat-91d5c0e7',
  payment: 'feat-4a6e82d1',
  app: 'feat-c3b90f52',
  streaming: 'feat-5b0e7a13',
  band: 'band-5e17d8f0',
  features: 'text-6c58e2b7',
  referees: 'feat-3e1a5c77',
};

export const en = {
  hero: `<CmHero id="hero-a1b2c3d4"
  title="Acme"
  subtitle="Acme is the world's best tournament system for the world's best tournaments"
  ctaText="Learn more about Acme"
  ctaLink="/en/missa-inte/"
  backgroundMedia="/media/start-video-002-optimized.mp4"
  poster="/media/home/hero-poster.jpg"
/>
`,
  section: `<CmSection id="sect-e5f6a7b8"
  heading="What is Acme?"
  contain="true"
  align="left"
  body={"Acme helps you as a tournament organiser deliver a smooth, fantastic overall experience to your participants. From registration, payment, draws and match schedules to live reporting of goals and final results on the web, in mobile apps or via SMS.\\n\\nWe've made it simple for tournaments of every size and complexity, big or small."}
  divider={true}
  contained={true}
/>
`,
  ai: `<CmFeatureRow id="feat-2c8d91e4"
  eyebrow="Smarter scheduling with AI"
  title="How it works in Acme"
  ctaText="Read more about AI in Acme here"
  ctaLink="/en/vara-ai-losningar/"
  image="/media/home/ai-image-copy-1.webp"
  imageAlt="AI scheduling in Acme"
  imagePosition="left"
  bgColor="white"
>
  Building a match schedule that actually works is a complex puzzle – especially with hundreds or thousands of matches, multiple venues, rest periods and special requests to consider.
</CmFeatureRow>
`,
  fjordby: `<CmFeatureRow id="feat-7f04b3a9"
  eyebrow="CASE STUDY: FJORDBY BASKET FESTIVAL"
  title="One of our customers shares their story"
  ctaText="Read about Fjordby Basket Festival here"
  ctaLink="/en/fjordby-basket-festival/"
  image="/media/home/customer-story.png"
  imageAlt="Fjordby Basket Festival"
  imagePosition="right"
  bgColor="light"
>
  Read our feature on a successful journey for basketball and Fjordby, Norway. Ola Nordvik talks about their journey – how they've grown, what they've achieved, and the new goals they keep setting for their tournament's future.
</CmFeatureRow>
`,
  support: `<CmFeatureRow id="feat-91d5c0e7"
  eyebrow="WE'RE PROUD OF OUR SUPPORT"
  title="World-class support"
  ctaText="Read more about our support here"
  ctaLink="/en/support/"
  image="/media/home/support.webp"
  imageAlt="The Acme support team"
  imagePosition="left"
  bgColor="white"
>
  Perhaps the most defining part of Acme is our support. Everyone at the company works with one ultimate goal: helping our customers. We're available every day to help you with everything from quick questions to hands-on assistance with match schedules and planning advice.
</CmFeatureRow>
`,
  payment: `<CmFeatureRow id="feat-4a6e82d1"
  eyebrow="SIMPLE PAYMENT SOLUTIONS"
  title="Accept card, Klarna or Swish payments with ease"
  ctaText="Read more about our payment solution"
  ctaLink="/en/kort-och-klarna/"
  image="/media/home/klarna_acme-3.webp"
  imageAlt="Payment with Klarna in Acme"
  imagePosition="right"
  bgColor="light"
  imageFocus="left center"
>
  Our modern payment solution means you can skip bank transfers entirely. Let teams pay by card or Klarna, so payments are registered automatically in the system and the money lands in your account right away.
</CmFeatureRow>
`,
  app: `<CmFeatureRow id="feat-c3b90f52"
  eyebrow="ENGAGE YOUR VISITORS"
  title="Your own mobile app for Android and iPhone"
  ctaText="Get an app for your tournament"
  ctaLink="/en/app/"
  image="/media/home/usp-mobile-app.jpg"
  imageAlt="A dedicated mobile app for the tournament"
  imagePosition="left"
  bgColor="white"
>
  We can help you get your own mobile app for the tournament. We handle all the development, and the app connects directly to your tournament in Acme, so you can manage everything from one place.
</CmFeatureRow>
`,
  band: `<CmBandHeading id="band-5e17d8f0"
  heading="More information for the interested"
  bg="white"
  align="left"
  contained={true}
/>
`,
  columns: `<CmColumns id="cols-8b2f47c6"
  align="left"
  columns="2"
  gap="48"
  maxWidth={1140}
>
  <CmColumn id="col-d94a10e3"
    heading="Key features"
  >
    <TextBlock id="text-6c58e2b7">
      Don't miss our other great features, including live results, live streaming, a dedicated tournament website, accommodation & catering, referees, SMS notifications and check-in.
    </TextBlock>
    <CmButton id="btn-31f7a9d0"
      label="Read more about our features"
      href="/en/missa-inte/"
      variant="green"
      icon="none"
    />
  </CmColumn>
  <CmColumn id="col-59a3e8d7"
    heading="Pricing"
  >
    <TextBlock id="text-c21f80b4">
      We keep pricing simple, with a model that works for tournaments large and small across every sport. On top of a team-based licence, there's a range of optional extra services to choose from.
    </TextBlock>
    <CmButton id="btn-e40b97c3"
      label="Read more about our pricing"
      href="/en/priser/"
      variant="green"
      icon="none"
    />
  </CmColumn>
</CmColumns>
`,
  sister: `<CmFeatureRow id="feat-06c9e3b8"
  eyebrow="COLLECT PAYMENTS FOR YOUR CLUB"
  title="Acme Clubs"
  ctaText="Read more about Acme Clubs"
  ctaLink="https://clubs.acme.example/"
  image="/media/home/si.jpg"
  imageAlt="Acme Clubs"
  imagePosition="right"
  bgColor="light"
>
  Our sister product Acme Clubs is used by close to 1,000 clubs across Norway and Sweden to collect training fees and membership dues. It lets you tailor your collection to your needs while staying easy to use.
</CmFeatureRow>
`,
  youthcup: `<CmFeatureRow id="feat-f15b72a0"
  eyebrow="SPORT MATTERS IN A GLOBAL WORLD"
  title="Community, hope and growth – both at home and in East Africa."
  ctaText="Read more about the partnership"
  ctaLink="/en/lakeside-youth-cup/"
  image="/media/home/LakesideYouthCup.webp"
  imageAlt="Lakeside Youth Cup"
  imagePosition="left"
  bgColor="light"
>
  We partner with the Lakeside Youth Cup (LYC), an annual youth festival in Tanzania that empowers young people through sport, education and community engagement.
</CmFeatureRow>
`,
};

export const sv = {
  hero: `<CmHero id="hero-a1b2c3d4"
  title="Acme"
  subtitle="Acme är världens bästa turneringssystem för världens bästa turneringar"
  ctaText="Läs mer om Acme"
  ctaLink="/sv/missa-inte/"
  backgroundMedia="/media/start-video-002-optimized.mp4"
  poster="/media/home/hero-poster.jpg"
/>
`,
  section: `<CmSection id="sect-e5f6a7b8"
  heading="Vad är Acme?"
  contain="true"
  align="left"
  body={"Acme hjälper dig som arrangerar turneringar att enkelt och smidigt ge en fantastisk helhetsupplevelse till dina deltagare. Från anmälning, betallösning, lottning och spelschema till liverapportering av mål och slutresultat till webb, mobilappar eller sms.\\n\\nVi har gjort det enkelt för stora, små, enkla och komplexa turneringar."}
  divider={true}
  contained={true}
/>
`,
  ai: `<CmFeatureRow id="feat-2c8d91e4"
  eyebrow="Smartare schemaläggning med AI"
  title="Så fungerar det i Acme"
  ctaText="Läs mer om AI i Acme här"
  ctaLink="/sv/vara-ai-losningar/"
  image="/media/home/ai-image-copy-1.webp"
  imageAlt="AI-schemaläggning i Acme"
  imagePosition="left"
  bgColor="white"
>
  Att lägga ett fungerande spelschema är ett komplext pussel – särskilt när det handlar om hundratals eller tusentals matcher, flera spelplatser, vilotider och specialönskemål.
</CmFeatureRow>
`,
  fjordby: `<CmFeatureRow id="feat-7f04b3a9"
  eyebrow="CASE STUDIE: FJORDBY BASKET FESTIVAL"
  title="En av våra kunder berättar"
  ctaText="Läs om Fjordby Basket Festival här"
  ctaLink="/sv/fjordby-basket-festival/"
  image="/media/home/customer-story.png"
  imageAlt="Fjordby Basket Festival"
  imagePosition="right"
  bgColor="light"
>
  Läs vårt reportage om en lyckad resa för basket och Fjordby i Norge. Ola Nordvik berättar lite om deras resa, hur de avancerat, lyckats och fortsätter att sätta upp nya mål i framtiden med sin turnering.
</CmFeatureRow>
`,
  support: `<CmFeatureRow id="feat-91d5c0e7"
  eyebrow="VI ÄR STOLTA ÖVER VÅR SUPPORT"
  title="Support i världsklass"
  ctaText="Läs mer om vår support här"
  ctaLink="/sv/support/"
  image="/media/home/support.webp"
  imageAlt="Acme-supporten"
  imagePosition="left"
  bgColor="white"
>
  Den kanske mest definierande delen av Acme är vår support. Vi arbetar hårt för att alla i företaget har som yttersta mål att hjälpa våra kunder. Vi finns tillgängliga varje dag för att hjälpa er med allt från enskilda frågor till att assistera med spelschema och rådgivning.
</CmFeatureRow>
`,
  payment: `<CmFeatureRow id="feat-4a6e82d1"
  eyebrow="ENKLA BETALLÖSNINGAR"
  title="Ta enkelt betalt med kort, Klarna eller Swish"
  ctaText="Läs mer om vår betallösning"
  ctaLink="/sv/kort-och-klarna/"
  image="/media/home/klarna_acme-3.webp"
  imageAlt="Betalning med Klarna i Acme"
  imagePosition="right"
  bgColor="light"
  imageFocus="left center"
>
  Med vår moderna betallösning kan ni slippa alla bankbetalningar. Låt lagen betala med kort eller Klarna vilket gör att betalningarna registreras automatiskt i systemet och ni får era pengar direkt.
</CmFeatureRow>
`,
  app: `<CmFeatureRow id="feat-c3b90f52"
  eyebrow="ENGAGERA ERA BESÖKARE"
  title="Er egen mobilapp för Android och iPhone"
  ctaText="Skaffa en app för er turnering"
  ctaLink="/sv/app/"
  image="/media/home/usp-mobile-app.jpg"
  imageAlt="Egen mobilapp för turneringen"
  imagePosition="left"
  bgColor="white"
>
  Vi kan hjälpa er att få er egen mobilapp för turneringen. Vi gör allt arbete med att utveckla appen och den blir sedan kopplad till turneringen i Acme vilket gör att ni kan administrera allt från ett och samma ställe.
</CmFeatureRow>
`,
  /** Sweden only. */
  streaming: `<CmFeatureRow id="feat-5b0e7a13"
  eyebrow="LIVESTREAMING MED GLOBEX LIVE"
  title="Sänd alla matcher live – och tjäna pengar på det"
  ctaText="Läs mer om livestreaming"
  ctaLink="/sv/streaming/"
  image="/media/streaming/pix4team-camera.gif"
  imageAlt="AI-kamera på stativ som automatiskt följer matchen"
  imagePosition="right"
  bgColor="light"
>
  Tillsammans med vår partner Globex Live kan ni livestreama alla matcher med AI-kameror som följer spelet automatiskt. Tittarna betalar per match eller för hela turneringen – en ny intäktskälla för cupen.
</CmFeatureRow>
`,
  band: `<CmBandHeading id="band-5e17d8f0"
  heading="Mer information för den intresserade"
  bg="white"
  align="left"
  contained={true}
/>
`,
  columns: `<CmColumns id="cols-8b2f47c6"
  align="left"
  columns="2"
  gap="48"
  maxWidth={1140}
>
  <CmColumn id="col-d94a10e3"
    heading="Viktiga funktioner"
  >
    <TextBlock id="text-6c58e2b7">
      Missa inte att vi också har häftiga funktioner som livestreaming med Globex Live, liveresultat, egen hemsida för turneringen, boende & mat, domare, SMS-utskick och incheckning.
    </TextBlock>
    <CmButton id="btn-31f7a9d0"
      label="Läs mer om våra funktioner"
      href="/sv/missa-inte/"
      variant="green"
      icon="none"
    />
  </CmColumn>
  <CmColumn id="col-59a3e8d7"
    heading="Prissättning"
  >
    <TextBlock id="text-c21f80b4">
      Vi har en enkel prissättning som passar både små och stora turneringar i olika sporter. Förutom en lagbaserad licens finns det många extratjänster att välja till!
    </TextBlock>
    <CmButton id="btn-e40b97c3"
      label="Läs mer om våra priser"
      href="/sv/priser/"
      variant="green"
      icon="none"
    />
  </CmColumn>
</CmColumns>
`,
  sister: `<CmFeatureRow id="feat-06c9e3b8"
  eyebrow="TA BETALT FÖR FÖRENINGEN"
  title="Acme Clubs"
  ctaText="Läs mer om Acme Clubs"
  ctaLink="https://clubs.acme.example/"
  image="/media/home/si.jpg"
  imageAlt="Acme Clubs"
  imagePosition="right"
  bgColor="light"
>
  Vår systerprodukt Acme Clubs används av uppemot 1000 klubbar för att samla in träningsavgifter och medlemsavgifter, i både Norge och Sverige. Systemet låter dig anpassa er insamling samtidigt som det är väldigt lättanvänt.
</CmFeatureRow>
`,
  youthcup: `<CmFeatureRow id="feat-f15b72a0"
  eyebrow="IDROTT ÄR VIKTIGT I EN GLOBAL VÄRLD"
  title="Gemenskap, hopp och utveckling – både här hemma och i Östafrika."
  ctaText="Läs mer om samarbetet"
  ctaLink="/sv/lakeside-youth-cup/"
  image="/media/home/LakesideYouthCup.webp"
  imageAlt="Lakeside Youth Cup"
  imagePosition="left"
  bgColor="light"
>
  Vi samarbetar med Lakeside Youth Cup (LYC), en årlig ungdomsfestival i Tanzania som stärker unga genom idrott, utbildning och samhällsengagemang.
</CmFeatureRow>
`,
};

type Blocks = Record<string, string>;

/** A page from blocks in an order: front matter, imports, then each block,
 *  a blank line apart. */
export function page(lang: 'en' | 'sv', blocks: Blocks, order: string[]): string {
  return [frontmatter[lang], imports, ...order.map(k => {
    if (!(k in blocks)) throw new Error(`no block ${k} in ${lang}`);
    return blocks[k];
  })].join('\n');
}

export const enOrder = ['hero', 'section', 'ai', 'fjordby', 'support', 'payment', 'app', 'band', 'columns', 'sister', 'youthcup'];
export const svOrder = ['hero', 'section', 'payment', 'ai', 'support', 'streaming', 'app', 'fjordby', 'band', 'columns', 'sister', 'youthcup'];

export const home = { en: page('en', en, enOrder), sv: page('sv', sv, svOrder) };
