import ModalOverlay from './ModalOverlay';
import './TermsModal.css';
import { AFFILIATE_ACTIVE, AFFILIATE_DISCLOSURE } from '../data/affiliate';

// Testo segnaposto: serve perché la registrazione DEVE avere un link ai
// Termini/Privacy da far spuntare (obbligo GDPR + buona prassi), ma non è
// testo legale vero — nessun avvocato lo ha scritto o rivisto. Prima di un
// lancio pubblico su larga scala va fatto verificare da un professionista;
// per ora serve a non lasciare la casella "a vuoto" e a essere onesti con
// chi si registra su cosa succede ai suoi dati.
export default function TermsModal({ open, onClose }) {
  if (!open) return null;

  return (
    <ModalOverlay onClose={onClose} className="rb-terms-overlay">
      <div className="rb-terms-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <h2>Termini di servizio e Privacy</h2>

        <p className="rb-terms-draft-notice">
          Bozza informativa, non ancora rivista da un legale: descrive in buona fede come funziona
          Versemove oggi, ma non sostituisce un testo verificato da un professionista prima di un
          uso su larga scala.
        </p>

        <h3>Termini di servizio</h3>
        <ul>
          <li>Versemove è una piattaforma social in sviluppo: le funzioni possono cambiare senza preavviso.</li>
          <li>Devi avere l'età minima richiesta per i contenuti che vuoi usare (alcuni mondi sono riservati ai maggiorenni).</li>
          <li>I dati che inserisci (nome utente, nickname, dati anagrafici, allegati) devono riguardare te o, per un'azienda, la tua attività.</li>
          <li>Non è consentito pubblicare contenuti illegali, violenti, discriminatori o che violino i diritti di terzi.</li>
          <li>L'account può essere sospeso o rimosso dai moderatori in caso di violazione di queste regole.</li>
        </ul>

        <h3>Pubblicità e link affiliati</h3>
        <ul>
          {AFFILIATE_ACTIVE && <li>{AFFILIATE_DISCLOSURE}</li>}
          <li>Alcune offerte del mondo Vetrina e alcuni spazi pubblicitari portano a negozi esterni: se acquisti da quei link Versemove può ricevere una commissione, senza costi aggiuntivi per te.</li>
          <li>Nel mondo Bambini compaiono solo pubblicità scelte come adatte ai bambini, senza profilazione.</li>
        </ul>

        <h3>Informativa privacy</h3>
        <ul>
          <li>I dati raccolti in registrazione (mail, dati anagrafici, tipo account, genere, pronomi, eventuali allegati) servono a creare e gestire il tuo profilo.</li>
          <li>I dati sono conservati su Supabase (infrastruttura cloud UE) e protetti da regole di accesso: solo tu e lo staff autorizzato potete leggerli.</li>
          <li>Puoi chiedere in qualsiasi momento la modifica o cancellazione dei tuoi dati contattando lo staff.</li>
          <li>Il consenso al trattamento per finalità di marketing è separato e facoltativo: non è richiesto per usare l'app.</li>
        </ul>

        <button type="button" className="rb-btn-primary rb-terms-close-btn" onClick={onClose}>
          Ho letto, chiudi
        </button>
      </div>
    </ModalOverlay>
  );
}
