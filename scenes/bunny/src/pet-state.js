// What the rabbit remembers: how close it has grown to you, how it feels, when it last
// ate and when you were last here. Kept across runs so it is the same rabbit tomorrow.
//
// Storage: the wallpaper host hands the page its saved state as `window.habitatSavedState`
// and takes changes back through a `state` message handler, because the wallpaper's web
// view keeps no site data of its own. A browser preview uses localStorage instead.

const KEY = "bunny.rabbit";
const VERSION = 1;

// Closeness grows by these amounts; feeding counts a few times a day, and petting and
// playing have cooldowns so holding the pointer on the rabbit is not a farm.
export const RULES = {
  feed: { intimacy: 20, mood: 18, perDay: 3, cooldown: 60 },
  pet: { intimacy: 3, mood: 4, cooldown: 45 },
  play: { intimacy: 10, mood: 12, cooldown: 300 },
  visit: { intimacy: 5 },
  // Mood settles toward a baseline over hours away, and sinks a little if never fed.
  moodDrift: { perHour: -3, baseline: 55, hungryAfterHours: 20, hungryPenalty: -10 },
  // Closeness needed to leave each level; the bar in the panel shows the current span.
  levelSpan: (level) => 100 + 40 * (level - 1),
};

export const MOODS = [
  { min: 85, label: "开心", face: "😊" },
  { min: 65, label: "满足", face: "🙂" },
  { min: 45, label: "平静", face: "😌" },
  { min: 25, label: "想你", face: "🥺" },
  { min: 0, label: "困了", face: "😴" },
];

export const SPEECH = {
  greet: ["你回来啦！今天扫地吗？", "早～阳光刚好晒到我。", "我在等你，也在等扫帚。", "今天想吃三根胡萝卜。"],
  feed: ["胡萝卜！！！", "咔嚓咔嚓……好吃。", "谢谢！叶子也要吃。", "唔……再来一根可以吗？"],
  full: ["我吃饱啦，肚子圆圆的。", "今天吃得够多了，留一点给明天。"],
  pet: ["好舒服……再摸摸～", "耳朵……对，就是那里。", "♡♡♡", "我原谅你昨天扫我了。"],
  play: ["扫帚！扫帚！扫帚！", "追不到我～追不到我～", "再挥一下！再挥一下！"],
  lunge: ["看我的！", "咬！", "别跑！"],
  bite: ["咬到了！哼！", "嘿嘿，抓住了。", "这个是我的了。", "不许扫我的地！"],
  miss: ["差一点！", "再来！", "它躲开了……"],
  caught: ["哼，扫帚被我打败了。", "累了，先歇会儿。", "这局我赢。"],
  rest: ["有点困了……我小睡一会儿。", "晒着太阳睡最舒服。", "别扫地，我要睡了。"],
  wake: ["唔？你在呀。", "醒啦！扫帚在哪？"],
  idle: ["今天的地板好亮。", "你说，扫帚是不是也在等我？", "晒太阳的时候不想动。", "耳朵好长，是不是又长了？", "胡萝卜什么时候到。"],
};

// One line for each day of the year, picked by the date so it stays put all day.
export const DAILY = [
  "Good things happen to people who pet rabbits.",
  "今天也要像兔子一样，想追就追。",
  "扫地是为了让阳光有地方落。",
  "慢一点也没关系，胡萝卜每天都在。",
  "一只兔子的快乐：地板、阳光、扫帚。",
  "把烦心事扫出去，把兔子留下来。",
  "陪伴是最长情的告白，兔子也知道。",
  "今天也辛苦了，来摸摸兔子。",
  "耳朵垂着，心情是飞着的。",
  "不用说话，坐在一起晒太阳就很好。",
  "A cuter life, more carrots, happier me.",
  "被兔子咬过的扫帚，是幸运的扫帚。",
];

function now() {
  return Date.now();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const dayKey = (time) => new Date(time).toDateString();

function fresh() {
  return {
    version: VERSION,
    intimacy: 0,
    mood: 70,
    lastFed: 0,
    fedOn: "",
    fedCount: 0,
    lastPet: 0,
    lastPlay: 0,
    lastSeen: now(),
    visitedOn: "",
    meals: 0,
    bites: 0,
    name: "兔兔",
  };
}

function read() {
  let raw = null;
  if (typeof window !== "undefined" && window.habitatSavedState) raw = window.habitatSavedState;
  else {
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      raw = null;
    }
  }
  if (!raw) return fresh();
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || parsed.version !== VERSION) return fresh();
    return { ...fresh(), ...parsed };
  } catch {
    return fresh();
  }
}

function write(state) {
  const text = JSON.stringify(state);
  try {
    window.webkit?.messageHandlers?.state?.postMessage(text);
  } catch {
    // Not in the wallpaper.
  }
  try {
    localStorage.setItem(KEY, text);
  } catch {
    // Storage may be unavailable under a custom scheme; the host copy is what matters.
  }
}

export function createPetState() {
  const state = read();
  const listeners = new Set();
  let saveTimer = null;

  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      write(state);
    }, 400);
  }
  function emit(event, detail) {
    for (const listener of listeners) listener(event, detail, state);
  }

  // Time away: mood drifts toward its baseline, faster the hungrier the rabbit is, and
  // the first visit of a day is worth something in itself.
  function arrive() {
    const away = (now() - state.lastSeen) / 3.6e6;
    if (away > 0.25) {
      const drift = RULES.moodDrift.perHour * Math.min(away, 48);
      const hungry = (now() - state.lastFed) / 3.6e6 > RULES.moodDrift.hungryAfterHours;
      const target = RULES.moodDrift.baseline + (hungry ? RULES.moodDrift.hungryPenalty : 0);
      // Drift only toward the baseline, never past it.
      if (state.mood > target) state.mood = Math.max(target, state.mood + drift);
    }
    let firstToday = false;
    if (state.visitedOn !== dayKey(now())) {
      state.visitedOn = dayKey(now());
      state.intimacy += RULES.visit.intimacy;
      firstToday = true;
    }
    state.lastSeen = now();
    save();
    return firstToday;
  }

  const level = () => {
    let remaining = state.intimacy;
    let lv = 1;
    while (remaining >= RULES.levelSpan(lv)) {
      remaining -= RULES.levelSpan(lv);
      lv++;
    }
    return { level: lv, into: remaining, span: RULES.levelSpan(lv) };
  };
  const mood = () => MOODS.find((m) => state.mood >= m.min) ?? MOODS.at(-1);
  const line = (kind) => {
    const lines = SPEECH[kind] ?? SPEECH.idle;
    return lines[Math.floor(Math.random() * lines.length)];
  };
  const canFeed = () => {
    if (state.fedOn !== dayKey(now())) return true;
    return state.fedCount < RULES.feed.perDay && now() - state.lastFed > RULES.feed.cooldown * 1000;
  };

  function feed() {
    if (state.fedOn !== dayKey(now())) {
      state.fedOn = dayKey(now());
      state.fedCount = 0;
    }
    if (!canFeed()) {
      emit("full", { text: line("full") });
      return false;
    }
    state.fedCount++;
    state.meals++;
    state.lastFed = now();
    state.intimacy += RULES.feed.intimacy;
    state.mood = clamp(state.mood + RULES.feed.mood, 0, 100);
    save();
    emit("feed", { text: line("feed") });
    return true;
  }

  function pet() {
    const rewarded = now() - state.lastPet > RULES.pet.cooldown * 1000;
    if (rewarded) {
      state.lastPet = now();
      state.intimacy += RULES.pet.intimacy;
    }
    state.mood = clamp(state.mood + (rewarded ? RULES.pet.mood : 1), 0, 100);
    save();
    emit("pet", { text: line("pet"), rewarded });
    return rewarded;
  }

  function play() {
    const rewarded = now() - state.lastPlay > RULES.play.cooldown * 1000;
    if (rewarded) {
      state.lastPlay = now();
      state.intimacy += RULES.play.intimacy;
    }
    state.mood = clamp(state.mood + (rewarded ? RULES.play.mood : 2), 0, 100);
    save();
    emit("play", { text: line("play"), rewarded });
    return rewarded;
  }

  // A bite on the broom is play: rewarded on the play cooldown, counted every time.
  function bite() {
    state.bites++;
    const rewarded = now() - state.lastPlay > RULES.play.cooldown * 1000;
    if (rewarded) {
      state.lastPlay = now();
      state.intimacy += RULES.play.intimacy;
    }
    state.mood = clamp(state.mood + (rewarded ? RULES.play.mood : 1), 0, 100);
    save();
    emit("bite", { text: line("bite"), rewarded });
    return rewarded;
  }

  function rest() {
    emit("rest", { text: line("rest") });
  }
  function wake() {
    state.mood = clamp(state.mood + 3, 0, 100);
    save();
    emit("wake", { text: line("wake") });
  }
  function poke() {
    emit("poke", { text: line("poke") });
  }
  function tick() {
    state.lastSeen = now();
    save();
  }

  return {
    state,
    arrive,
    feed,
    pet,
    play,
    bite,
    rest,
    wake,
    poke,
    tick,
    canFeed,
    level,
    mood,
    line,
    dailyLine(date = new Date()) {
      const start = new Date(date.getFullYear(), 0, 0);
      const day = Math.floor((date - start) / 864e5);
      return DAILY[day % DAILY.length];
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flush() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      write(state);
    },
  };
}
