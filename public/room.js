// Pointer parallax for the isometric room (adapted from the CodePen "3D Room" by Ricardo Oliva Alonso; scene designed by Jarlan Perez).
const h = document.querySelector("#h");
document.body.addEventListener("pointermove", (e) => {
  const x = e.pageX / window.innerWidth - 0.5;
  const y = e.pageY / window.innerHeight - 0.5;
  h.style.transform = `perspective(90vw) rotateX(${y * 10 + 75}deg) rotateZ(${-x * 25 + 45}deg) translateZ(-9vw)`;
});

// Accent themes: shift the room's blues (--hb) and purples (--hp) by degrees of hue. Try /?theme=crimson
const THEMES = {
  crimson: [145, 105],   // blues -> red, purples -> deep red/magenta
  "emerald-crimson": [-85, 115], // blues -> green, purples -> red
  violet: [40, 0],       // blues -> purple
  amber: [-170, -200],   // everything warm
  teal: [-30, -10],
};
const t = new URLSearchParams(location.search).get("theme");
if (THEMES[t]) {
  document.documentElement.style.setProperty("--hb", THEMES[t][0]);
  document.documentElement.style.setProperty("--hp", THEMES[t][1]);
}
