// Aplica o tema salvo antes da página pintar (evita piscar).
(function () {
  try {
    var t = localStorage.getItem("spec-tema");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
