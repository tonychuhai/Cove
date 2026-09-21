const SCENES = [
  { id: "riverscape", label: "鱼缸", mark: "🐟" },
  { id: "bunny", label: "兔子", mark: "🐇" },
  { id: "muse", label: "换装", mark: "👗" },
  { id: "critters", label: "纸上", mark: "🐾" },
];

function currentScene() {
  const parts = location.pathname.split("/").filter(Boolean);
  const at = parts.indexOf("scenes");
  return at >= 0 && parts[at + 1] ? parts[at + 1] : "riverscape";
}

function wallpaperPage(id) {
  return location.pathname.includes("wallpaper.html")
    ? `/scenes/${id}/wallpaper.html`
    : `/scenes/${id}/`;
}

function go(id) {
  if (id === currentScene()) return;
  if (window.webkit?.messageHandlers?.scene) {
    window.webkit.messageHandlers.scene.postMessage(id);
    return;
  }
  location.assign(wallpaperPage(id));
}

const here = currentScene();
const nav = document.createElement("nav");
nav.id = "scene-switch";
nav.setAttribute("aria-label", "切换场景");
for (const scene of SCENES) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.scene = scene.id;
  button.innerHTML = `<span aria-hidden="true">${scene.mark}</span>${scene.label}`;
  if (scene.id === here) button.setAttribute("aria-current", "page");
  button.addEventListener("click", () => go(scene.id));
  nav.append(button);
}
document.body.append(nav);

const previous = window.habitatClick;
window.habitatClick = (x, y) => {
  const button = document.elementFromPoint(x, y)?.closest("[data-scene]");
  if (button) {
    button.click();
    return;
  }
  if (typeof previous === "function") previous(x, y);
};
