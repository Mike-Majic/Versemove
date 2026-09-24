import InfoBadge from '../InfoBadge';
import './CollapsibleSection.css';

// Fisarmonica riusabile: titolo (bottone che apre/chiude), (i) facoltativa
// con la spiegazione, freccetta (altro bottone, stessa azione del titolo) —
// tre elementi affiancati, non un unico bottone, perché la (i) apre una sua
// vignetta e non deve anche aprire/chiudere la voce. Nata dentro
// SettingsPanel (Personalizza/Privacy), estratta qui per riusarla anche
// altrove (es. Il mio profilo -> Profilo Social/Lavoro/Incontri) senza
// duplicarla una seconda volta.
export default function CollapsibleSection({ title, infoText, open, onToggle, children, level = 'group' }) {
  const Wrapper = level === 'group' ? 'section' : 'div';
  const rowClass = level === 'group' ? 'rb-settings-accordion-row' : 'rb-settings-subaccordion-row';
  const titleClass = level === 'group' ? 'rb-settings-accordion-header' : 'rb-settings-subaccordion-header';
  return (
    <Wrapper className={level === 'group' ? 'rb-settings-section' : 'rb-settings-subaccordion'}>
      <div className={rowClass}>
        <button type="button" className={titleClass} onClick={onToggle} aria-expanded={open}>
          {title}
        </button>
        {infoText && <InfoBadge text={infoText} />}
        <button
          type="button"
          className="rb-settings-accordion-chevron-btn"
          onClick={onToggle}
          tabIndex={-1}
          aria-hidden="true"
        >
          {open ? '−' : '+'}
        </button>
      </div>
      {open && (
        <div className={level === 'group' ? 'rb-settings-accordion-body' : 'rb-settings-subaccordion-body'}>
          {children}
        </div>
      )}
    </Wrapper>
  );
}
