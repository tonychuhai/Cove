// The overlay: the rabbit's panel, the speech bubble that floats over its head, and the
// row of actions. It only reads the pet state and asks for actions; the rules live in
// pet-state.js.

export function createUI({ pet, wallpaper }) {
  const el = (id) => document.getElementById(id);
  const bubble = el("bubble");
  const level = el("level"), intimacy = el("intimacy"), intimacyBar = el("intimacy-bar");
  const moodFace = el("mood-face"), moodLabel = el("mood-label"), mood = el("mood"), moodBar = el("mood-bar");
  const daily = el("daily");
  const name = el("pet-name");
  const actions = el("actions");
  const handlers = new Set();
  let bubbleTimer = null;
  let dailyDay = -1;

  name.textContent = pet.state.name;
  if (actions) {
    actions.hidden = wallpaper;
    actions.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button || button.disabled) return;
      for (const handler of handlers) handler(button.dataset.action);
    });
  }

  function refresh() {
    const { state } = pet;
    const lv = pet.level();
    level.textContent = `Lv.${lv.level}`;
    intimacy.textContent = `${lv.into}/${lv.span}`;
    intimacyBar.style.width = `${Math.round((lv.into / lv.span) * 100)}%`;
    const m = pet.mood();
    moodFace.textContent = m.face;
    moodLabel.textContent = m.label;
    mood.textContent = `${Math.round(state.mood)}/100`;
    moodBar.style.width = `${Math.round(state.mood)}%`;
    if (actions) {
      const feed = actions.querySelector('[data-action="feed"]');
      const can = pet.canFeed();
      feed.disabled = !can;
      feed.title = can ? "" : "今天吃得够多了，明天再喂吧";
    }
  }

  function tick(now = new Date()) {
    if (now.getDate() !== dailyDay) {
      dailyDay = now.getDate();
      daily.textContent = pet.dailyLine(now);
    }
  }

  function say(text, { hold = 6000 } = {}) {
    bubble.textContent = text;
    bubble.hidden = false;
    bubble.style.opacity = 1;
    // Restart the pop animation.
    bubble.style.animation = "none";
    void bubble.offsetWidth;
    bubble.style.animation = "";
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
      bubble.style.opacity = 0;
      bubbleTimer = setTimeout(() => {
        bubble.hidden = true;
      }, 450);
    }, hold);
  }

  // Keep the bubble over the rabbit's head; x, y in CSS pixels of the canvas.
  function placeBubble(x, y) {
    if (bubble.hidden) return;
    const w = bubble.offsetWidth || 120;
    const cx = Math.min(Math.max(x, w / 2 + 8), innerWidth - w / 2 - 8);
    bubble.style.left = `${cx}px`;
    bubble.style.top = `${Math.max(y, 60)}px`;
  }

  return {
    refresh,
    tick,
    say,
    placeBubble,
    onAction(handler) {
      handlers.add(handler);
    },
  };
}
