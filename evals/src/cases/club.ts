/**
 * The documents the cases are made of: a rowing club's pages, translated by
 * hand. Cases start from these and change them with `change`.
 */
import { doc } from '../case.js';

export const membership = {
  en: doc(`
# Membership

Join the Riverside Rowing Club and get access to boats, coaching and the clubhouse.

## Fees

Membership costs 200 SEK per year. Students pay half.

Pay by card or PayPal.

## Opening hours

The boathouse is open every day from 7 to 21 during the season.

## Contact

Email the board at board@riverside.example.
`),
  sv: doc(`
# Medlemskap

Bli medlem i Riverside Roddklubb och få tillgång till båtar, träning och klubbhuset.

## Avgifter

Medlemskapet kostar 200 kr per år. Studenter betalar halva priset.

Betala med kort eller Swish.

## Öppettider

Båthuset är öppet varje dag mellan 7 och 21 under säsongen.

## Kontakt

Mejla styrelsen på board@riverside.example.
`),
  de: doc(`
# Mitgliedschaft

Werde Mitglied im Riverside Ruderclub und erhalte Zugang zu Booten, Training und dem Clubhaus.

## Beiträge

Die Mitgliedschaft kostet 200 SEK pro Jahr. Studierende zahlen die Hälfte.

Bezahle mit Karte oder PayPal.

## Öffnungszeiten

Das Bootshaus ist während der Saison täglich von 7 bis 21 Uhr geöffnet.

## Kontakt

Schreib dem Vorstand an board@riverside.example.
`),
};

/** Three courses whose details are word for word the same, but for the
 *  heading and the description. */
export const courses = {
  en: doc(`
# Courses

## Beginner course

Eight evenings on the water with an instructor.

Time: Tuesdays 18–20
Place: The boathouse
Price: 1 200 SEK
[Book a place](/book)

## Intermediate course

Six evenings focusing on technique.

Time: Tuesdays 18–20
Place: The boathouse
Price: 1 200 SEK
[Book a place](/book)

## Sculling course

Four evenings in single sculls.

Time: Tuesdays 18–20
Place: The boathouse
Price: 1 200 SEK
[Book a place](/book)
`),
  sv: doc(`
# Kurser

## Nybörjarkurs

Åtta kvällar på vattnet med instruktör.

Tid: tisdagar 18–20
Plats: Båthuset
Pris: 1 200 kr
[Boka plats](/book)

## Fortsättningskurs

Sex kvällar med fokus på teknik.

Tid: tisdagar 18–20
Plats: Båthuset
Pris: 1 200 kr
[Boka plats](/book)

## Scullerkurs

Fyra kvällar i singelsculler.

Tid: tisdagar 18–20
Plats: Båthuset
Pris: 1 200 kr
[Boka plats](/book)
`),
};

/** 24 questions and answers: a long page where most of the text never
 *  changes. Two answers mention "100 SEK" on purpose. */
const faqEntries: [enQ: string, enA: string, svQ: string, svA: string][] = [
  ['How do I become a member?', 'Fill in the form on the membership page.', 'Hur blir jag medlem?', 'Fyll i formuläret på medlemssidan.'],
  ['Do I need to know how to swim?', 'Yes, all members must be able to swim 200 metres.', 'Behöver jag kunna simma?', 'Ja, alla medlemmar måste kunna simma 200 meter.'],
  ['Is there an age limit?', 'Juniors can start rowing from the age of 12.', 'Finns det en åldersgräns?', 'Juniorer kan börja ro från 12 års ålder.'],
  ['When does the season start?', 'The season starts in April, when the ice has gone.', 'När börjar säsongen?', 'Säsongen börjar i april, när isen har gått.'],
  ['Can I try before joining?', 'Yes, we hold try-out evenings every Tuesday in May.', 'Kan jag prova innan jag går med?', 'Ja, vi har prova-på-kvällar varje tisdag i maj.'],
  ['What should I wear?', 'Tight-fitting sports clothes that you can move in.', 'Vad ska jag ha på mig?', 'Åtsittande träningskläder som du kan röra dig i.'],
  ['Do I get a key to the boathouse?', 'Yes, the key deposit is 100 SEK.', 'Får jag en nyckel till båthuset?', 'Ja, depositionen för nyckeln är 100 kr.'],
  ['Can I bring a guest?', 'Guests may row twice per season with a member.', 'Får jag ta med en gäst?', 'Gäster får ro två gånger per säsong tillsammans med en medlem.'],
  ['Is coaching included?', 'Coaching on Tuesdays and Thursdays is included in the fee.', 'Ingår träning med tränare?', 'Träning med tränare på tisdagar och torsdagar ingår i avgiften.'],
  ['Can I row alone?', 'Only after passing the sculling test.', 'Får jag ro ensam?', 'Först när du har klarat singelprovet.'],
  ['What happens in bad weather?', 'The duty officer decides whether boats may go out.', 'Vad händer vid dåligt väder?', 'Dagens ansvarige bestämmer om båtarna får gå ut.'],
  ['Do you race?', 'We enter three regattas each summer.', 'Tävlar ni?', 'Vi deltar i tre regattor varje sommar.'],
  ['Is there a gym?', 'Yes, the gym is open all year round.', 'Finns det ett gym?', 'Ja, gymmet är öppet året runt.'],
  ['Can I rent a boat?', 'Boats are for members only and cannot be rented.', 'Kan jag hyra en båt?', 'Båtarna är bara för medlemmar och kan inte hyras.'],
  ['How do I book a boat?', 'Book in the app at least one hour ahead.', 'Hur bokar jag en båt?', 'Boka i appen minst en timme i förväg.'],
  ['Are there showers?', 'Yes, there are showers and a sauna in the clubhouse.', 'Finns det duschar?', 'Ja, det finns duschar och bastu i klubbhuset.'],
  ['Can I store my own boat?', 'Private boats can be stored for a fee if there is room.', 'Kan jag förvara min egen båt?', 'Privata båtar kan förvaras mot en avgift om det finns plats.'],
  ['Do you have lockers?', 'Yes, lockers cost 100 SEK per season.', 'Finns det skåp?', 'Ja, ett skåp kostar 100 kr per säsong.'],
  ['Is there parking?', 'Parking is free behind the boathouse.', 'Finns det parkering?', 'Parkeringen bakom båthuset är gratis.'],
  ['Do you organise social events?', 'Yes, we hold a spring party and an autumn dinner.', 'Ordnar ni sociala aktiviteter?', 'Ja, vi har en vårfest och en höstmiddag.'],
  ['How do I cancel my membership?', 'Email the treasurer before 1 December.', 'Hur säger jag upp mitt medlemskap?', 'Mejla kassören före den 1 december.'],
  ['Can I pause my membership?', 'You can pause for one season at a time.', 'Kan jag pausa mitt medlemskap?', 'Du kan pausa en säsong i taget.'],
  ['Who runs the club?', 'A board elected at the annual meeting in March.', 'Vem driver klubben?', 'En styrelse som väljs på årsmötet i mars.'],
  ['How can I help out?', 'Sign up for a work day on the club calendar.', 'Hur kan jag hjälpa till?', 'Anmäl dig till en arbetsdag i klubbkalendern.'],
];

export const faq = {
  en: '# Frequently asked questions\n\n' + faqEntries.map(([q, a]) => `### ${q}\n\n${a}\n`).join('\n'),
  sv: '# Vanliga frågor\n\n' + faqEntries.map(([, , q, a]) => `### ${q}\n\n${a}\n`).join('\n'),
};
