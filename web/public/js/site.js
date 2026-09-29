/* Digital Guru — public site behaviour (no dependencies). */
(function () {
  'use strict';
  var d = document;
  var body = d.body;
  d.documentElement.classList.add('js');

  /* ───────── storage helpers (never throw) ───────── */
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function getCookie(n) { var m = d.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }

  /* ───────── Attribution: UTM, click ids, landing page, referrer ───────── */
  var ATTR_KEY = 'dg_attr';
  var ATTR_TTL = 30 * 24 * 3600 * 1000;
  (function captureAttribution() {
    var q = new URLSearchParams(location.search);
    var utm = {};
    ['source', 'medium', 'campaign', 'content', 'term'].forEach(function (k) { var v = q.get('utm_' + k); if (v) utm[k] = v.slice(0, 200); });
    if (q.get('gclid')) utm.gclid = q.get('gclid').slice(0, 300);
    if (q.get('fbclid')) utm.fbclid = q.get('fbclid').slice(0, 300);
    var ref = d.referrer && d.referrer.indexOf(location.host) === -1 ? d.referrer : '';
    var existing = store(ATTR_KEY);
    var expired = existing && Date.now() - existing.ts > ATTR_TTL;
    // New campaign params always win (last paid touch); otherwise keep the first touch.
    if (Object.keys(utm).length || !existing || expired) {
      store(ATTR_KEY, { utm: utm, landingPage: location.href.split('#')[0].slice(0, 500), referrer: ref.slice(0, 500), ts: Date.now() });
    }
  })();
  function attribution() { return store(ATTR_KEY) || { utm: {}, landingPage: location.href, referrer: d.referrer || '' }; }

  /* ───────── CSRF token for API calls ───────── */
  var csrfPromise = null;
  function csrf() {
    var t = getCookie('dg_csrf');
    if (t) return Promise.resolve(t);
    if (!csrfPromise) {
      csrfPromise = fetch('/api/public/config', { credentials: 'same-origin' }).then(function (r) { return r.json(); })
        .then(function (j) { return j.csrfToken || getCookie('dg_csrf'); });
    }
    return csrfPromise;
  }

  function track(cta) {
    var a = attribution();
    csrf().then(function (token) {
      fetch('/api/public/events', {
        method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ cta: cta, pageUrl: location.href.slice(0, 500), referrer: a.referrer, utm: a.utm }),
      }).catch(function () {});
    }).catch(function () {});
    gaEvent(cta === 'call' ? 'click_call' : cta === 'whatsapp' ? 'click_whatsapp' : 'click_' + cta);
  }

  /* ───────── Optional GA4 ───────── */
  var gaId = body.getAttribute('data-ga');
  if (gaId) {
    var s = d.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gaId); d.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date()); window.gtag('config', gaId);
  }
  function gaEvent(name, params) { if (window.gtag) window.gtag('event', name, params || {}); }

  /* ───────── Header: scroll state, mobile nav, services menu ───────── */
  var header = d.querySelector('.site-header');
  function onScroll() { if (header) header.classList.toggle('is-scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  var burger = d.querySelector('.nav-burger');
  var nav = d.getElementById('main-nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      body.style.overflow = open ? 'hidden' : '';
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) { nav.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); body.style.overflow = ''; }
    });
  }
  d.querySelectorAll('.has-menu').forEach(function (li) {
    var btn = li.querySelector('.menu-toggle');
    var hoverable = window.matchMedia('(hover: hover) and (min-width: 981px)');
    function set(open) { li.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', String(open)); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); set(!li.classList.contains('is-open')); });
    li.addEventListener('mouseenter', function () { if (hoverable.matches) set(true); });
    li.addEventListener('mouseleave', function () { if (hoverable.matches) set(false); });
    d.addEventListener('click', function (e) { if (!li.contains(e.target)) set(false); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  });

  /* ───────── Reveal on scroll ───────── */
  var reveals = d.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el, i) { el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ───────── Modals ───────── */
  var quoteModal = d.getElementById('quote-modal');
  var waModal = d.getElementById('wa-modal');
  function openModal(m) {
    if (!m) return;
    if (typeof m.showModal === 'function') m.showModal(); else m.setAttribute('open', '');
    body.style.overflow = 'hidden';
    renderTurnstile(m);
    var first = m.querySelector('input:not([type=hidden]):not([tabindex="-1"])');
    if (first && window.matchMedia('(min-width: 700px)').matches) setTimeout(function () { first.focus(); }, 60);
  }
  function closeModal(m) { if (m.open && typeof m.close === 'function') m.close(); else m.removeAttribute('open'); body.style.overflow = ''; }
  d.querySelectorAll('dialog.modal').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-close]')) closeModal(m); });
    m.addEventListener('close', function () { body.style.overflow = ''; });
  });

  d.addEventListener('click', function (e) {
    var q = e.target.closest('[data-quote]');
    if (q) {
      e.preventDefault();
      var form = quoteModal && quoteModal.querySelector('form');
      if (form) {
        var sel = form.querySelector('[name=service]');
        if (sel && q.getAttribute('data-service')) sel.value = q.getAttribute('data-service');
        form.querySelector('[name=formUsed]').value = q.getAttribute('data-form') || 'popup';
      }
      openModal(quoteModal);
      track('quote_open');
      return;
    }
    var w = e.target.closest('[data-whatsapp]');
    if (w) {
      e.preventDefault();
      var ws = waModal && waModal.querySelector('[name=service]');
      if (ws && w.getAttribute('data-service')) ws.value = w.getAttribute('data-service');
      openModal(waModal);
      return;
    }
    var c = e.target.closest('[data-cta]');
    if (c) track(c.getAttribute('data-cta'));
  });

  // Timed popup: once per 7 days, after real engagement, never on contact/thank-you pages
  (function autoPopup() {
    if (!quoteModal || /^\/(contact|thank-you)/.test(location.pathname)) return;
    var last = store('dg_popup');
    if (last && Date.now() - last < 7 * 24 * 3600 * 1000) return;
    var armed = false, timerDone = false;
    setTimeout(function () { timerDone = true; maybe(); }, 25000);
    window.addEventListener('scroll', function () {
      if (!armed && window.scrollY / (d.documentElement.scrollHeight - innerHeight) > 0.45) { armed = true; maybe(); }
    }, { passive: true });
    function maybe() {
      if (!armed || !timerDone || d.querySelector('dialog[open]') || store('dg_submitted')) return;
      store('dg_popup', Date.now());
      openModal(quoteModal);
    }
  })();

  /* ───────── Cloudflare Turnstile (only if configured) ───────── */
  var tsKey = body.getAttribute('data-turnstile');
  function renderTurnstile(scope) {
    if (!tsKey) return;
    (scope || d).querySelectorAll('.ts-slot').forEach(function (slot) {
      if (slot.dataset.rendered || !window.turnstile) return;
      if (slot.offsetParent === null && !slot.closest('dialog[open]')) return;
      slot.dataset.rendered = '1';
      slot.dataset.widget = window.turnstile.render(slot, { sitekey: tsKey, theme: 'light', size: 'flexible' });
    });
  }
  if (tsKey) window.addEventListener('load', function () { setTimeout(function () { renderTurnstile(d); }, 300); });

  /* ───────── Lead forms ───────── */
  var phoneRe = /^\+?[0-9\s-]{8,16}$/;
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function setFieldError(input, msg) {
    var field = input.closest('.field');
    if (!field) return;
    field.classList.toggle('has-error', !!msg);
    var el = field.querySelector('.field-msg');
    if (msg) {
      if (!el) { el = d.createElement('span'); el.className = 'field-msg'; field.appendChild(el); }
      el.textContent = msg;
      input.setAttribute('aria-invalid', 'true');
    } else {
      if (el) el.remove();
      input.removeAttribute('aria-invalid');
    }
  }

  function validate(form) {
    var ok = true, firstBad = null;
    var name = form.elements.name, phone = form.elements.phone, email = form.elements.email;
    function check(input, cond, msg) { if (!input) return; var bad = !cond; setFieldError(input, bad ? msg : ''); if (bad) { ok = false; firstBad = firstBad || input; } }
    check(name, name && name.value.trim().length >= 2, 'Please enter your name');
    check(phone, phone && phoneRe.test(phone.value.trim()) && phone.value.replace(/\D/g, '').length >= 8, 'Please enter a valid phone number');
    if (email) check(email, !email.value.trim() || emailRe.test(email.value.trim()), 'Please enter a valid email');
    if (firstBad) firstBad.focus();
    return ok;
  }

  d.querySelectorAll('form[data-lead-form]').forEach(function (form) {
    var startedAt = 0;
    form.addEventListener('focusin', function () { if (!startedAt) startedAt = Date.now(); }, { once: true });
    form.addEventListener('input', function (e) { if (e.target.closest('.has-error')) setFieldError(e.target, ''); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errBox = form.querySelector('.form-error');
      errBox.hidden = true;
      if (!validate(form)) return;
      var btn = form.querySelector('button[type=submit]');
      var label = btn.querySelector('.btn-label');
      var original = label ? label.textContent : '';
      btn.disabled = true; if (label) label.textContent = 'Sending…';

      var fd = new FormData(form);
      var a = attribution();
      var payload = {
        name: fd.get('name') || '', phone: fd.get('phone') || '', email: fd.get('email') || '', company: fd.get('company') || '',
        service: fd.get('service') || '', budget: fd.get('budget') || '', message: fd.get('message') || '',
        preferredContact: fd.get('preferredContact') || '', formUsed: fd.get('formUsed') || 'contact', website: fd.get('website') || '',
        pageUrl: location.href.split('#')[0].slice(0, 500), landingPage: a.landingPage, referrer: a.referrer, utm: a.utm || {},
        startedAt: startedAt || Date.now() - 5000, turnstileToken: fd.get('cf-turnstile-response') || '',
      };
      var isWa = form.hasAttribute('data-wa-form');
      // Open the WhatsApp window synchronously to avoid popup blockers; point it at wa.me once saved.
      var waWin = isWa ? window.open('about:blank', '_blank') : null;

      csrf().then(function (token) {
        return fetch('/api/public/leads', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
          body: JSON.stringify(payload),
        });
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
      }).then(function (res) {
        if (!res.ok) {
          if (res.status === 403) csrfPromise = null;
          throw new Error(res.body.error || 'Something went wrong. Please try again or call us.');
        }
        store('dg_submitted', Date.now());
        gaEvent('generate_lead', { form: payload.formUsed, service: payload.service });
        if (isWa) {
          var sel = form.elements.service;
          var svcName = sel && sel.value ? sel.options[sel.selectedIndex].text : '';
          var msg = 'Hi Digital Guru, I\'m ' + payload.name.trim() + (svcName ? ' and I\'m interested in ' + svcName : '') + '.' + (res.body.reference ? ' (Ref: ' + res.body.reference + ')' : '');
          var url = 'https://wa.me/' + body.getAttribute('data-wa') + '?text=' + encodeURIComponent(msg);
          if (waWin) waWin.location.href = url; else location.href = url;
          closeModal(waModal);
          form.reset();
          btn.disabled = false; if (label) label.textContent = original;
          return;
        }
        location.href = '/thank-you' + (res.body.reference ? '?ref=' + encodeURIComponent(res.body.reference) : '');
      }).catch(function (err) {
        if (waWin) waWin.close();
        errBox.textContent = err.message || 'Network error. Please try again.';
        errBox.hidden = false;
        btn.disabled = false; if (label) label.textContent = original;
        if (window.turnstile) form.querySelectorAll('.ts-slot[data-widget]').forEach(function (s) { window.turnstile.reset(s.dataset.widget); });
      });
    });
  });

  // Conversion event on the thank-you page
  if (d.getElementById('conversion')) gaEvent('conversion_thank_you');
})();
