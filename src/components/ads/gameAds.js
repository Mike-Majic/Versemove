// Ritmo della pubblicità nei giochi (richiesta di Mike): ogni 2 partite un
// video saltabile dopo 5 secondi, ogni 5 partite uno saltabile dopo 30
// (alla 10ª, 20ª... vale quello da 30). Le partite si contano su questo
// dispositivo (localStorage), anche cambiando gioco o ricaricando la pagina.
const KEY = 'rb-games-played';

export function adBreakAfterGame() {
  let n = 0;
  try {
    n = (Number(localStorage.getItem(KEY)) || 0) + 1;
    localStorage.setItem(KEY, String(n));
  } catch {
    return 0;
  }
  if (n % 5 === 0) return 30;
  if (n % 2 === 0) return 5;
  return 0;
}
