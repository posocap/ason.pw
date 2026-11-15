// Pointer parallax for the isometric room (adapted from the CodePen "3D Room" by Ricardo Oliva Alonso; scene designed by Jarlan Perez).
const h = document.querySelector("#h");
document.body.addEventListener("pointermove", (e) => {
  const x = e.pageX / window.innerWidth - 0.5;
  const y = e.pageY / window.innerHeight - 0.5;
  h.style.transform = `perspective(90vw) rotateX(${y * 10 + 75}deg) rotateZ(${-x * 25 + 45}deg) translateZ(-9vw)`;
});
