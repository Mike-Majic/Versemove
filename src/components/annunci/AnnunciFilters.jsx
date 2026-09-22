import { fieldsForCategory } from '../../data/annunciSchema';
import CustomSelect from '../shared/CustomSelect';

const ORDER_OPTIONS = [
  { value: 'recenti', label: 'Più recenti' },
  { value: 'prezzo_asc', label: 'Prezzo crescente' },
  { value: 'prezzo_desc', label: 'Prezzo decrescente' },
  { value: 'vicini', label: 'Più vicini' },
];

// Filtri professionali generati dallo stesso file di configurazione usato
// dal form di pubblicazione (data/annunciSchema.js): un campo 'select'
// qui diventa una scelta multipla (chip), un campo 'number' diventa un
// intervallo min/max, un campo 'boolean' una casella "solo se".
export default function AnnunciFilters({ categoria, tipo, filters, setFilters, compact = false }) {
  const fields = fieldsForCategory(categoria, tipo);

  const updateField = (key, value) => {
    setFilters((prev) => ({ ...prev, fieldFilters: { ...prev.fieldFilters, [key]: value } }));
  };

  const toggleMulti = (key, value) => {
    const current = filters.fieldFilters[key] ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    updateField(key, next);
  };

  return (
    <div className={`rb-annunci-filters ${compact ? 'compact' : ''}`}>
      <label className="rb-field">
        <span>Prezzo</span>
        <div className="rb-annunci-range-row">
          <input
            type="number"
            placeholder="Min"
            value={filters.prezzoMin ?? ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, prezzoMin: e.target.value ? Number(e.target.value) : null }))}
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.prezzoMax ?? ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, prezzoMax: e.target.value ? Number(e.target.value) : null }))}
          />
        </div>
      </label>

      <label className="rb-field">
        <span>Zona</span>
        <input
          type="text"
          placeholder="Città"
          value={filters.citta ?? ''}
          onChange={(e) => setFilters((prev) => ({ ...prev, citta: e.target.value }))}
        />
      </label>

      <label className="rb-field rb-annunci-filter-chip">
        <input
          type="checkbox"
          checked={!!filters.soloConFoto}
          onChange={(e) => setFilters((prev) => ({ ...prev, soloConFoto: e.target.checked }))}
        />
        Solo con foto
      </label>

      <label className="rb-field">
        <span>Ordina per</span>
        <CustomSelect
          value={filters.ordinamento ?? 'recenti'}
          options={ORDER_OPTIONS}
          onChange={(v) => setFilters((prev) => ({ ...prev, ordinamento: v }))}
          ariaLabel="Ordina per"
        />
      </label>

      {fields.map((field) => {
        if (field.type === 'boolean') {
          return (
            <label key={field.key} className="rb-field rb-annunci-filter-chip">
              <input
                type="checkbox"
                checked={!!filters.fieldFilters[field.key]}
                onChange={(e) => updateField(field.key, e.target.checked)}
              />
              {field.label}
            </label>
          );
        }
        if (field.type === 'select') {
          const selected = filters.fieldFilters[field.key] ?? [];
          return (
            <div key={field.key} className="rb-field">
              <span>{field.label}</span>
              <div className="rb-chip-group">
                {field.options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`rb-chip ${selected.includes(opt.value) ? 'active' : ''}`}
                    onClick={() => toggleMulti(field.key, opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        if (field.type === 'number') {
          const range = filters.fieldFilters[field.key] ?? {};
          return (
            <label key={field.key} className="rb-field">
              <span>
                {field.label} {field.unit ? `(${field.unit})` : ''}
              </span>
              <div className="rb-annunci-range-row">
                <input
                  type="number"
                  placeholder="Min"
                  value={range.min ?? ''}
                  onChange={(e) => updateField(field.key, { ...range, min: e.target.value ? Number(e.target.value) : null })}
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={range.max ?? ''}
                  onChange={(e) => updateField(field.key, { ...range, max: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </label>
          );
        }
        return null;
      })}
    </div>
  );
}
