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

  // ── sticky mobile bar: show after hero scrolls away ──
  var heroSec = document.querySelector(".hero");
  if (heroSec && "IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      document.body.classList.toggle("scrolled", !es[0].isIntersecting);
    }, { threshold: 0 }).observe(heroSec);
  }

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

  // ── stat count-up ─────────────────────────────────
  var statsEl = document.querySelector(".stats");
  function animateStats() {
    statsEl.querySelectorAll("strong").forEach(function (s) {
      var raw = s.textContent.trim();
      var m = raw.match(/^(\D*)(\d+)(.*)$/);
      if (!m) return;
      var pre = m[1], target = parseInt(m[2], 10), suf = m[3];
      if (target === 0) return; // leave "0" as-is
      var dur = 1400, start = null;
      s.textContent = pre + "0" + suf;
      function step(ts) {
        if (!start) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        s.textContent = pre + Math.round(eased * target) + suf;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }
  if (statsEl && "IntersectionObserver" in window) {
    var done = false;
    var sio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && !done) { done = true; animateStats(); sio.disconnect(); }
      });
    }, { threshold: 0.4 });
    sio.observe(statsEl);
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

  // ── ROI calculator ────────────────────────────────
  (function () {
    var rVal = document.getElementById("r-value");
    if (!rVal) return;
    var rInq = document.getElementById("r-inq");
    var rNs = document.getElementById("r-ns");
    var oVal = document.getElementById("o-value");
    var oInq = document.getElementById("o-inq");
    var oNs = document.getElementById("o-ns");
    var elMonthly = document.getElementById("calc-monthly");
    var elAnnual = document.getElementById("calc-annual");
    var elNs = document.getElementById("calc-ns");
    var elLeads = document.getElementById("calc-leads");

    // conservative, footnoted assumptions
    var RED = 0.30, LOST = 0.25, REC = 0.5, CONV = 0.4;
    function shek(n) { return "₪" + Math.round(n).toLocaleString("en-US"); }
    function fill(r) {
      var p = ((r.value - r.min) / (r.max - r.min)) * 100;
      r.style.background = "linear-gradient(to right, var(--emerald) " + p + "%, var(--line-2) " + p + "%)";
    }
    var current = 0, raf;
    function tween(from, to) {
      cancelAnimationFrame(raf);
      var start = null, dur = 650;
      function step(ts) {
        if (!start) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        var e = 1 - Math.pow(1 - p, 3);
        elMonthly.textContent = shek(from + (to - from) * e);
        if (p < 1) raf = requestAnimationFrame(step);
      }
      raf = requestAnimationFrame(step);
    }
    function compute(animate) {
      var v = +rVal.value, inq = +rInq.value, ns = +rNs.value;
      oVal.textContent = "₪" + v.toLocaleString("en-US");
      oInq.textContent = inq;
      oNs.textContent = ns;
      [rVal, rInq, rNs].forEach(fill);
      var nsMoney = ns * RED * v;
      var leadMoney = inq * LOST * REC * CONV * v;
      var monthly = Math.round((nsMoney + leadMoney) / 10) * 10;
      elNs.textContent = shek(nsMoney);
      elLeads.textContent = shek(leadMoney);
      elAnnual.textContent = shek(monthly * 12);
      if (animate) tween(current, monthly);
      else elMonthly.textContent = shek(monthly);
      current = monthly;
    }
    [rVal, rInq, rNs].forEach(function (r) { r.addEventListener("input", function () { compute(false); }); });
    compute(false);
    // count the headline up the first time the card scrolls into view
    var card = document.querySelector(".calc-card"), shown = false;
    if ("IntersectionObserver" in window) {
      var cio = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && !shown) { shown = true; current = 0; compute(true); cio.disconnect(); }
        });
      }, { threshold: 0.3 });
      cio.observe(card);
    }
  })();

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
