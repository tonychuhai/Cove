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

function go(id, button) {
  if (id === currentScene()) return;
  // The next scene takes a few seconds to load; say so on the button that asked for it.
  for (const other of nav.querySelectorAll("[data-scene]")) other.removeAttribute("aria-busy");
  button.setAttribute("aria-busy", "true");
  if (window.webkit?.messageHandlers?.scene) {
    window.webkit.messageHandlers.scene.postMessage(id);
    return;
  }
  location.assign(wallpaperPage(id));
}

const here = currentScene();
const nav = document.createElement("nav");
nav.id = "scene-switch";
nav.setAttribute("aria-label", "Cove · 切换场景");
const brand = document.createElement("div");
brand.className = "brand";
brand.setAttribute("aria-hidden", "true");
brand.textContent = "Cove";
nav.append(brand);
for (const scene of SCENES) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.scene = scene.id;
  button.innerHTML = `<span aria-hidden="true">${scene.mark}</span>${scene.label}`;
  if (scene.id === here) button.setAttribute("aria-current", "page");
  button.addEventListener("click", () => go(scene.id, button));
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
