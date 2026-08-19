/* ==========================================================================
   Web Design Network — lógica compartida de /recursos
   1) facade de video: el iframe de YouTube no existe hasta que hacen click
   2) gate de email: pide los datos una vez y deja los archivos a la vista

   OJO: esto es un candado blando. Los archivos viven en URLs públicas de
   /uploads, así que quien las adivine entra sin dejar el mail. Frena al
   visitante normal, no a alguien decidido. Para candado real hace falta
   una serverless function que firme la descarga.
   ========================================================================== */

window.WDN = window.WDN || {};

/* --- CONFIG: acá va el backend que reciba los leads --------------------- */
WDN.config = {
  // Apps Script: pegá la URL del despliegue ("/exec"). Formspree: la URL del form.
  endpoint: "",
  // "appsscript" → POST form-encoded con no-cors (sin preflight)
  // "formspree"  → POST JSON con CORS y respuesta legible
  mode: "appsscript",
  storageKey: "wdn_recursos_lead"
};

/* --- estado del lead ---------------------------------------------------- */
WDN.getLead = function () {
  try {
    var raw = localStorage.getItem(WDN.config.storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

WDN.saveLead = function (lead) {
  try {
    localStorage.setItem(WDN.config.storageKey, JSON.stringify(lead));
  } catch (e) {
    /* modo incógnito con storage bloqueado: la sesión igual queda abierta */
  }
};

/* --- desbloqueo: cambia el candado por el botón de descarga ------------- */
var ICON_DOWNLOAD =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke-linecap="round"/></svg>';

WDN.unlock = function () {
  document.body.classList.add("is-unlocked");
  var assets = document.querySelectorAll(".asset[data-file]");
  for (var i = 0; i < assets.length; i++) {
    var asset = assets[i];
    var slot = asset.querySelector(".asset__state");
    if (!slot) continue;
    var file = asset.getAttribute("data-file");
    var name = asset.getAttribute("data-filename") || "";
    var a = document.createElement("a");
    a.className = "asset__dl";
    a.href = file;
    a.setAttribute("download", name);
    a.innerHTML = ICON_DOWNLOAD + "<span>Descargar</span>";
    slot.innerHTML = "";
    slot.appendChild(a);
  }
};

/* --- envío del lead ----------------------------------------------------- */
WDN.submitLead = function (lead) {
  var cfg = WDN.config;

  if (!cfg.endpoint) {
    // Sin backend configurado todavía: la página funciona igual, el lead se pierde.
    console.warn("[WDN] Falta WDN.config.endpoint — el lead no se guardó en ningún lado.");
    return Promise.resolve();
  }

  if (cfg.mode === "formspree") {
    return fetch(cfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(lead)
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
    });
  }

  // Apps Script: form-encoded + no-cors evita el preflight que Apps Script rechaza.
  // La contra es que la respuesta es opaca, así que no podemos distinguir un 500.
  var body = new URLSearchParams();
  Object.keys(lead).forEach(function (k) {
    body.append(k, lead[k]);
  });
  return fetch(cfg.endpoint, { method: "POST", mode: "no-cors", body: body });
};

/* --- modal -------------------------------------------------------------- */
WDN.initGate = function () {
  var gate = document.querySelector(".gate");
  if (!gate) return;

  var form = gate.querySelector("form");
  var error = gate.querySelector(".gate__error");
  var submit = gate.querySelector('button[type="submit"]');
  var lastFocus = null;

  function open() {
    lastFocus = document.activeElement;
    gate.setAttribute("data-open", "true");
    document.body.style.overflow = "hidden";
    var first = gate.querySelector("input");
    if (first) first.focus();
  }

  function close() {
    gate.setAttribute("data-open", "false");
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener("click", function (ev) {
    var trigger = ev.target.closest("[data-gate-open]");
    if (trigger) {
      ev.preventDefault();
      open();
    }
    if (ev.target.closest("[data-gate-close]") || ev.target === gate) close();
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && gate.getAttribute("data-open") === "true") close();
  });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    error.setAttribute("data-show", "false");

    var data = new FormData(form);
    var lead = {
      nombre: (data.get("nombre") || "").toString().trim(),
      email: (data.get("email") || "").toString().trim(),
      recurso: document.body.getAttribute("data-recurso") || "",
      origen: location.pathname,
      fecha: new Date().toISOString()
    };

    if (!lead.nombre || !lead.email) {
      error.textContent = "Completá tu nombre y tu email.";
      error.setAttribute("data-show", "true");
      return;
    }

    submit.disabled = true;
    submit.textContent = "Enviando…";

    WDN.submitLead(lead)
      .then(function () {
        WDN.saveLead(lead);
        WDN.unlock();
        close();
      })
      .catch(function () {
        error.textContent = "No pudimos enviar tus datos. Probá de nuevo en un momento.";
        error.setAttribute("data-show", "true");
      })
      .then(function () {
        submit.disabled = false;
        submit.textContent = "Desbloquear los archivos";
      });
  });
};

/* --- facade de video ---------------------------------------------------- */
WDN.initVideos = function () {
  var videos = document.querySelectorAll(".video[data-yt]");
  for (var i = 0; i < videos.length; i++) {
    (function (box) {
      function play() {
        if (box.getAttribute("data-loaded") === "true") return;
        box.setAttribute("data-loaded", "true");
        var id = box.getAttribute("data-yt");
        var frame = document.createElement("iframe");
        frame.src =
          "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0&modestbranding=1";
        frame.title = box.getAttribute("data-title") || "Video";
        frame.allow =
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
        frame.allowFullscreen = true;
        box.innerHTML = "";
        box.appendChild(frame);
      }
      box.addEventListener("click", play);
      // el facade es un div con role="button": Enter y Espacio tienen que reproducir igual
      box.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          play();
        }
      });
    })(videos[i]);
  }
};

/* --- arranque ----------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", function () {
  WDN.initVideos();
  WDN.initGate();
  if (WDN.getLead()) WDN.unlock();
});
