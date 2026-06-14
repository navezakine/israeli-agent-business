/* Replai landing — interactions */
(function () {
  "use strict";

  // ── config ────────────────────────────────────────
  var WA_NUMBER = "972528747637"; // your WhatsApp (no +)
  var WA_TEXT = encodeURIComponent("היי! ראיתי את Replai ואשמח לשמוע עוד 🙂");
  var LEAD_ENDPOINT = "https://israeli-agent-business-production.up.railway.app/landing-lead";

  document.getElementById("year").textContent = new Date().getFullYear();

  // ── whatsapp links ────────────────────────────────
  document.querySelectorAll(".js-whatsapp").forEach(function (a) {
    a.setAttribute("href", "https://wa.me/" + WA_NUMBER + "?text=" + WA_TEXT);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
  });

  // ── mobile nav ────────────────────────────────────
  var burger = document.querySelector(".nav-burger");
  var menu = document.querySelector(".mobile-menu");
  function closeMenu() {
    burger.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
    menu.classList.remove("show");
    setTimeout(function () { if (!menu.classList.contains("show")) menu.hidden = true; }, 300);
  }
  burger.addEventListener("click", function () {
    var open = burger.classList.toggle("open");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { menu.hidden = false; requestAnimationFrame(function () { menu.classList.add("show"); }); }
    else closeMenu();
  });
  menu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeMenu); });

  // ── scroll reveals (with safety fallbacks) ────────
  var reveals = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  function show(el) {
    var d = el.getAttribute("data-delay") || 0;
    setTimeout(function () { el.classList.add("in"); }, d);
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach(function (el) { io.observe(el); });
    // Reveal anything already in view on load (don't wait for a scroll).
    requestAnimationFrame(function () {
      reveals.forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight) show(el);
      });
    });
    // Safety net: never leave content hidden.
    setTimeout(function () { reveals.forEach(function (el) { el.classList.add("in"); }); }, 2200);
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // ── hero chat animation ───────────────────────────
  var body = document.getElementById("chat-body");
  var statusEl = document.getElementById("chat-status");
  var script = [
    { who: "user", text: "היי, אפשר לקבוע תור לבוטוקס? 😊" },
    { who: "agent", text: "היי! בשמחה 🙌 יש לי מחר שני חלונות פנויים:\n10:00 או 12:30. מה מתאים לך?" },
    { who: "user", text: "12:30 מעולה" },
    { who: "agent", text: "סבבה! על איזה שם לקבוע?" },
    { who: "user", text: "נועה לוי" },
    { who: "agent", text: "קבעתי לך, נועה ✅\nבוטוקס מחר ב-12:30, דיזנגוף 123.\nאשלח תזכורת יום לפני 🗓️" },
  ];

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function addMsg(m) {
    var el = document.createElement("div");
    el.className = "msg " + m.who;
    el.textContent = m.text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }
  function showTyping() {
    var t = document.createElement("div");
    t.className = "typing";
    t.innerHTML = "<span></span><span></span><span></span>";
    body.appendChild(t);
    body.scrollTop = body.scrollHeight;
    return t;
  }

  async function runChat() {
    while (true) {
      body.innerHTML = "";
      statusEl.textContent = "מחובר/ת";
      await delay(600);
      for (var i = 0; i < script.length; i++) {
        var m = script[i];
        if (m.who === "agent") {
          statusEl.textContent = "מקליד/ה…";
          var t = showTyping();
          await delay(950 + m.text.length * 12);
          t.remove();
          statusEl.textContent = "מחובר/ת";
        } else {
          await delay(700);
        }
        addMsg(m);
        await delay(500);
      }
      await delay(3800);
    }
  }
  if (body) runChat();

  // ── lead form ─────────────────────────────────────
  var form = document.getElementById("lead-form");
  var status = document.getElementById("form-status");
  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var data = {
        name: form.name.value.trim(),
        whatsapp: form.whatsapp.value.trim(),
        clinic: form.clinic.value.trim(),
      };
      if (!data.name || !data.whatsapp || !data.clinic) {
        status.textContent = "נא למלא את כל השדות 🙏";
        status.className = "form-status err";
        return;
      }
      status.textContent = "שולח…";
      status.className = "form-status";
      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true;

      try {
        var r = await fetch(LEAD_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!r.ok) throw new Error("bad status");
        status.textContent = "תודה! נחזור אליך בוואטסאפ ממש בקרוב ✅";
        status.className = "form-status ok";
        form.reset();
      } catch (err) {
        // Fallback: hand the lead straight to WhatsApp so nothing is lost.
        var txt = encodeURIComponent(
          "היי, אני " + data.name + " מ" + data.clinic +
          ". אשמח לדמו של Replai. הוואטסאפ שלי: " + data.whatsapp
        );
        status.textContent = "פותח וואטסאפ לשליחה מהירה… ✅";
        status.className = "form-status ok";
        window.open("https://wa.me/" + WA_NUMBER + "?text=" + txt, "_blank");
        form.reset();
      } finally {
        btn.disabled = false;
      }
    });
  }
})();
