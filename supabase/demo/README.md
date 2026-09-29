# Dati demo (29/09/2026)

1000 utenti finti sparsi per il mondo (165 paesi, 150 in Italia) con i loro
contenuti, per vedere come si riempiono i mondi. Tutti riconoscibili dall'email
`demoN@demo.versemove.invalid` (dominio che non può esistere).

## Tornare indietro

Dal SQL editor di Supabase (o da un account owner/moderatore via RPC):

```sql
select public.demo_rimuovi();
```

Cancella i 1000 utenti e tutto quello che hanno pubblicato (post, commenti,
eventi, offerte, annunci, gruppi, "cerco compagni", recensioni...). I dati degli
utenti veri non vengono toccati (provato in una transazione annullata: restano
i 6 profili e i 7 post reali).

Rete di sicurezza in più:
- schema `backup_prima_demo`: copia delle tabelle toccate prima del seed;
- tag git `backup-prima-demo-2026-09-29`: il codice prima di questo lavoro.

## Cosa contiene

| Mondo / categoria | Contenuto | Quanti |
|---|---|---|
| Social | post di testo, foto (anche galleria Fotografia), video (galleria Video), 2 commenti per post | 15 post, 30 commenti |
| Social | eventi con posizione (compaiono sul globo) | 5 |
| Social | gruppi con membri | 5 |
| Nerd, Gaming PC/PS/Xbox/Nintendo | clip, discussioni, "Cerco compagni" (+ build PC) | 5 per tipo |
| Nerd, Cosplay | galleria, WIP, discussioni, eventi, "Cerco gruppo" | 5 per tipo |
| Nerd, Eventi gaming | tornei, fiere, raduni | 5 |
| Intrattenimento, Teatro/Arti visive/Live | eventi + eventi della community | 5 + 5 per categoria |
| Vetrina, tutte le 14 categorie | offerte degli utenti (2 codici sconto già scaduti) | 5 per categoria |
| Annunci, auto/moto/biciclette/barche/case | annunci di utenti italiani | 5 per categoria |
| FAQ, Suggerimenti | suggerimenti | 5 |
| Animali, Cani | recensioni di 5 luoghi vicino a Roma | 5 |
| Incontri, Match | i 1000 profili sono tutti maggiorenni e candidati | 1000 |

Immagini: picsum.photos; video: esempi pubblici di Google; avatar: DiceBear
(disegnati, non foto di persone vere).

Non riempibili da database: Tattoo (tabelle assenti), Podcast e clip Musica
(servono file nello storage), videochiamate (si chiudono senza partecipanti
connessi), dirette (devono essere canali davvero live), Libreria, Cinema,
Streaming, giochi e minigiochi (dati esterni). Annunci "abbigliamento" e
"oggetti vari": il vincolo `annunci_listings_categoria_check` accetta solo
auto, moto, biciclette, barche, case.

Nota: gli utenti del database non compaiono come pallini sul globo; oggi i
pallini delle persone vengono da `src/data/mockUsers.js` (lista vuota).
