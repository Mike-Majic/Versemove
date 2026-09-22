import { useEffect, useState } from 'react';
import { listCommunityEvents, createCommunityEvent, deleteCommunityEvent } from '../../data/communityEvents';
import { getCommunityReactionsSummary, toggleCommunityReaction } from '../../data/culturalReactions';
import { displayName } from '../../data/posts';
import ReactionButtons from './ReactionButtons';
import './cultural.css';

function formatEventDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

function NewEventForm({ categoryId, onCreated, onCancel }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!title.trim() || creating) return;
    setCreating(true);
    setError('');
    const { event, error: err } = await createCommunityEvent({ categoryId, title, description, location, eventDate });
    setCreating(false);
    if (err) {
      setError(err);
      return;
    }
    onCreated(event);
  };

  return (
    <div className="rb-cultural-form">
      <input type="text" placeholder="Titolo (es. Amleto, Aida...)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      <input type="text" placeholder="Luogo (facoltativo)" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={160} />
      <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
      <textarea placeholder="Descrizione (facoltativa)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
      {error && <p className="rb-cultural-status rb-cultural-error">{error}</p>}
      <div className="rb-cultural-form-actions">
        <button type="button" onClick={onCancel}>Annulla</button>
        <button type="button" className="rb-cultural-form-submit" onClick={submit} disabled={!title.trim() || creating}>
          {creating ? 'Pubblicazione...' : 'Pubblica'}
        </button>
      </div>
    </div>
  );
}

// Colonna condivisa da Teatro, Arte (musei/mostre) e Live (concerti/festival):
// niente catalogo esterno affidabile e gratuito per questi tre, quindi gli
// eventi li aggiungono gli utenti stessi (community_events); stesse due
// reazioni di Cinema per organizzarsi e vedere chi altro ci va.
export default function CommunityEventsColumn({ categoryId, label, user, onOpenAuth, onShowReactors }) {
  const [events, setEvents] = useState(null);
  const [reactions, setReactions] = useState(new Map());
  const [showForm, setShowForm] = useState(false);

  const refresh = async () => {
    const list = await listCommunityEvents(categoryId);
    setEvents(list);
    setReactions(await getCommunityReactionsSummary(list.map((e) => e.id)));
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  const handleToggle = async (eventId, reazione) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    const summary = reactions.get(eventId) ?? { vuole: [], piaciuto: [], myReactions: new Set() };
    const active = summary.myReactions.has(reazione);
    const { error } = await toggleCommunityReaction(eventId, reazione, active);
    if (error) return;
    setReactions((prev) => {
      const next = new Map(prev);
      const entry = { vuole: [...summary.vuole], piaciuto: [...summary.piaciuto], myReactions: new Set(summary.myReactions) };
      const me = { id: user.id, name: displayName(user, 'Tu'), avatar: user.avatar || '' };
      if (active) {
        entry[reazione] = entry[reazione].filter((p) => p.id !== user.id);
        entry.myReactions.delete(reazione);
      } else {
        entry[reazione] = [...entry[reazione], me];
        entry.myReactions.add(reazione);
      }
      next.set(eventId, entry);
      return next;
    });
  };

  const handleDelete = async (eventId) => {
    const { error } = await deleteCommunityEvent(eventId);
    if (error) return;
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  return (
    <div className="rb-cultural-column">
      <div className="rb-cultural-header">
        <div>
          <h3>{label}</h3>
          <p>Aggiunti dalla community — reagisci per farti trovare da chi ci vuole andare con te.</p>
        </div>
        {user && !showForm && (
          <button type="button" className="rb-cultural-add-btn" onClick={() => setShowForm(true)}>+ Aggiungi</button>
        )}
      </div>

      {showForm && (
        <NewEventForm
          categoryId={categoryId}
          onCancel={() => setShowForm(false)}
          onCreated={(event) => {
            setShowForm(false);
            setEvents((prev) => [event, ...(prev ?? [])]);
          }}
        />
      )}

      {events === null ? (
        <p className="rb-cultural-status">Carico...</p>
      ) : events.length === 0 ? (
        <p className="rb-cultural-status">Nessun evento ancora in questa categoria — sii il primo ad aggiungerne uno.</p>
      ) : (
        <ul className="rb-cultural-list">
          {events.map((ev) => (
            <li key={ev.id} className="rb-cultural-card">
              <div className="rb-cultural-card-info">
                <strong>{ev.title}</strong>
                <p className="rb-cultural-card-meta">
                  {[ev.location, formatEventDate(ev.event_date)].filter(Boolean).join(' · ')}
                </p>
                {ev.description && <p className="rb-cultural-card-desc">{ev.description}</p>}
              </div>
              <ReactionButtons
                summary={reactions.get(ev.id)}
                onToggle={(reazione) => handleToggle(ev.id, reazione)}
                onShowReactors={(reazione, list) =>
                  onShowReactors({
                    title: reazione === 'vuole' ? 'Vogliono andarci' : 'A cui è piaciuto',
                    subtitle: ev.title,
                    reactors: list,
                  })
                }
              />
              {user?.id === ev.created_by && (
                <button type="button" className="rb-cultural-delete-btn" onClick={() => handleDelete(ev.id)}>Elimina</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
