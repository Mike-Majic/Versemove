// Frase obbligatoria del programma di affiliazione Amazon (Accordo
// operativo Amazon Associates, sezione "Identificazione come Affiliato"):
// deve comparire in modo chiaro sul sito che usa i link affiliati. È nei
// Termini e sotto le offerte della Vetrina.
export const AFFILIATE_DISCLOSURE = 'In qualità di Affiliato Amazon, Versemove riceve un guadagno dagli acquisti idonei.';

// Spento finché Versemove non è iscritto ad Amazon Associates (niente
// AMAZON_ASSOCIATE_TAG nei segreti del deals-bot, quindi nessun guadagno):
// la frase sopra sarebbe falsa. Quando il tag è attivo, mettere true.
export const AFFILIATE_ACTIVE = false;
