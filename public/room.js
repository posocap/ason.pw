// Pointer parallax for the isometric room (adapted from the CodePen "3D Room" by Ricardo Oliva Alonso; scene designed by Jarlan Perez).
const h = document.querySelector("#h");
document.body.addEventListener("pointermove", (e) => {
  const x = e.pageX / window.innerWidth - 0.5;
  const y = e.pageY / window.innerHeight - 0.5;
  h.style.transform = `perspective(90vw) rotateX(${y * 10 + 75}deg) rotateZ(${-x * 25 + 45}deg) translateZ(-9vw)`;
});

// Accent themes: shift the room's blues (--hb) and purples (--hp) by degrees of hue. Default is crimson.
const THEMES = {
  blue: [0, 0],
  crimson: [145, 105],
  "emerald-crimson": [-85, 115],
  violet: [40, 0],
  amber: [-170, -200],
  teal: [-30, -10],
};
const buttons = document.querySelectorAll(".themes button");
function setTheme(name, save) {
  if (!THEMES[name]) return;
  document.documentElement.style.setProperty("--hb", THEMES[name][0]);
  document.documentElement.style.setProperty("--hp", THEMES[name][1]);
  buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === name)));
  if (save) { try { localStorage.setItem("room-theme", name); } catch (e) {} }
}
let saved = null;
try { saved = localStorage.getItem("room-theme"); } catch (e) {}
setTheme(new URLSearchParams(location.search).get("theme") || saved || "crimson");
buttons.forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.theme, true)));
