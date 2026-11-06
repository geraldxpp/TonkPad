/*
 * dc-runtime.js — tiny standalone runtime for the Tonkpad design-reference pages.
 *
 * It renders the small .dc.html subset the design canvas uses:
 *   {{ dotted.path }} holes in text and attributes, <sc-for list as>, <sc-if value>,
 *   on* event bindings (onClick, onChange, onSubmit ...), ref callbacks and
 *   controlled input values, driven by a `class Component extends DCLogic`.
 *
 * Re-renders patch the existing DOM in place, so CSS animations (radar sweep,
 * live pulses) keep running smoothly when state changes.
 *
 * This is for viewing the design only. The real app is built in web/.
 */
(function () {
  'use strict';

  class DCLogic {
    constructor(props) {
      this.props = props || {};
      this.state = {};
    }
    setState(patch, cb) {
      const next = typeof patch === 'function' ? patch(this.state, this.props) : patch;
      this.state = Object.assign({}, this.state, next);
      if (this.__schedule) this.__schedule(cb);
    }
    forceUpdate(cb) {
      if (this.__schedule) this.__schedule(cb);
    }
  }

  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  const HTML_NS = 'http://www.w3.org/1999/xhtml';

  function lookup(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return parseFloat(path);
    const parts = path.split('.');
    let v = scope[parts[0]];
    for (let i = 1; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  const str = (v) => (v == null ? '' : String(v));
  const interp = (s, scope) => s.replace(HOLE, (_, p) => str(lookup(p, scope)));
  const attrVal = (s, scope) => {
    const m = s.match(WHOLE);
    return m ? lookup(m[1], scope) : interp(s, scope);
  };

  // React-style onChange fires on every keystroke for text-like inputs.
  function eventType(attrName, tag, typeAttr) {
    const t = attrName.slice(2).toLowerCase();
    if (t === 'change') {
      const type = (typeAttr || '').toLowerCase();
      if (tag === 'textarea' || (tag === 'input' && type !== 'checkbox' && type !== 'radio' && type !== 'file')) return 'input';
    }
    return t;
  }

  function bind(el, type, fn) {
    if (!el.__h) el.__h = {};
    el.__h[type] = fn;
    if (!el.__bound) el.__bound = {};
    if (!el.__bound[type]) {
      el.__bound[type] = true;
      el.addEventListener(type, (e) => {
        const h = el.__h && el.__h[type];
        if (typeof h === 'function') h(e);
      });
    }
  }

  let refs = [];

  function renderNodes(parent, scope, out) {
    for (let n = parent.firstChild; n; n = n.nextSibling) renderNode(n, scope, out);
  }

  function renderNode(n, scope, out) {
    if (n.nodeType === 3) {
      const v = n.nodeValue;
      out.appendChild(document.createTextNode(v.indexOf('{{') === -1 ? v : interp(v, scope)));
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.localName;
    if (tag === 'helmet') return;
    if (tag === 'sc-for') {
      const list = attrVal(n.getAttribute('list') || '', scope);
      const as = n.getAttribute('as') || 'item';
      if (Array.isArray(list)) {
        list.forEach((item, i) => {
          const s = Object.create(scope);
          s[as] = item;
          s.$index = i;
          renderNodes(n, s, out);
        });
      }
      return;
    }
    if (tag === 'sc-if') {
      if (attrVal(n.getAttribute('value') || '', scope)) renderNodes(n, scope, out);
      return;
    }

    // Build the element attribute by attribute so placeholder URLs never load.
    const el = n.namespaceURI === HTML_NS ? document.createElement(tag) : document.createElementNS(n.namespaceURI, n.localName);
    let value;
    for (const a of Array.from(n.attributes)) {
      const name = a.name;
      const raw = a.value;
      if (name.slice(0, 2).toLowerCase() === 'on' && WHOLE.test(raw)) {
        const fn = lookup(raw.match(WHOLE)[1], scope);
        if (typeof fn === 'function') bind(el, eventType(name, tag, n.getAttribute('type')), fn);
        continue;
      }
      if (name === 'ref') {
        const fn = attrVal(raw, scope);
        if (typeof fn === 'function') refs.push([fn, el]);
        continue;
      }
      if (raw.indexOf('{{') === -1) {
        el.setAttribute(name, raw);
        continue;
      }
      const v = attrVal(raw, scope);
      if (name === 'value' && (tag === 'input' || tag === 'textarea')) {
        value = str(v);
        continue;
      }
      if (v == null || (v === false && name.slice(0, 5) !== 'aria-')) continue;
      el.setAttribute(name, str(v));
    }
    if (value !== undefined) {
      el.__value = value;
      el.value = value;
    }
    renderNodes(n, scope, el);
    out.appendChild(el);
  }

  // ---- in-place DOM patching (keeps running animations alive) ----
  function morph(x, y) {
    if (x.nodeType === 3) {
      if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue;
      return;
    }
    if (x.nodeType !== 1) return;
    y.__live = x;
    for (let i = x.attributes.length - 1; i >= 0; i--) {
      const nm = x.attributes[i].name;
      if (!y.hasAttribute(nm)) x.removeAttribute(nm);
    }
    for (const at of Array.from(y.attributes)) {
      if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    }
    if (x.__h) {
      for (const t of Object.keys(x.__h)) if (!y.__h || !(t in y.__h)) delete x.__h[t];
    }
    if (y.__h) {
      for (const t of Object.keys(y.__h)) bind(x, t, y.__h[t]);
    }
    if ('__value' in y) {
      if (x.value !== y.__value && document.activeElement !== x) x.value = y.__value;
      x.__value = y.__value;
    }
    morphChildren(x, y);
  }

  function morphChildren(a, b) {
    const next = Array.from(b.childNodes);
    let cur = a.firstChild;
    for (const y of next) {
      if (!cur) {
        a.appendChild(y);
        continue;
      }
      const x = cur;
      cur = cur.nextSibling;
      if (x.nodeType === y.nodeType && x.nodeName === y.nodeName) morph(x, y);
      else a.replaceChild(y, x);
    }
    while (cur) {
      const nx = cur.nextSibling;
      a.removeChild(cur);
      cur = nx;
    }
  }

  // ---- small toast for links to screens that are later modules ----
  let toastEl = null;
  let toastTimer = 0;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('role', 'status');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;padding:10px 16px;border-radius:12px;background:#141723;border:1px solid #2A2F42;color:#F3F4FA;font:500 13px Geist,system-ui,sans-serif;box-shadow:0 20px 40px -12px rgba(0,0,0,.7);transition:opacity .2s;opacity:0;pointer-events:none';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, 2400);
  }
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[data-later]') : null;
    if (!a) return;
    e.preventDefault();
    toast(a.getAttribute('data-later') + ' is a later module, so it is not in this reference.');
  });

  function boot() {
    const tpl = document.getElementById('dc-template');
    const script = document.querySelector('script[type="text/x-dc"]');
    const root = document.getElementById('dc-root');
    if (!tpl || !script || !root) throw new Error('dc-runtime: missing #dc-template, #dc-root or the x-dc script');

    const helmet = tpl.content.querySelector('helmet');
    if (helmet) for (const n of Array.from(helmet.children)) document.head.appendChild(document.importNode(n, true));

    const props = {};
    try {
      const p = JSON.parse(script.getAttribute('data-props') || '{}');
      for (const k of Object.keys(p)) if (k[0] !== '$' && p[k] && 'default' in p[k]) props[k] = p[k].default;
    } catch (err) { /* no editable props */ }

    const Component = new Function('DCLogic', script.textContent + '\n;return Component;')(DCLogic);
    const inst = new Component(props);
    let queued = false;
    let mounted = false;
    let cbs = [];

    const render = () => {
      queued = false;
      refs = [];
      const vals = inst.renderVals();
      const box = document.createElement('div');
      renderNodes(tpl.content, vals, box);
      if (!mounted) {
        while (box.firstChild) root.appendChild(box.firstChild);
      } else {
        morphChildren(root, box);
      }
      const rs = refs;
      refs = [];
      rs.forEach(([fn, el]) => fn(el.__live || el));
      if (!mounted) {
        mounted = true;
        if (inst.componentDidMount) inst.componentDidMount();
      } else if (inst.componentDidUpdate) {
        inst.componentDidUpdate();
      }
      const run = cbs;
      cbs = [];
      run.forEach((f) => f());
    };
    inst.__schedule = (cb) => {
      if (cb) cbs.push(cb);
      if (!queued) {
        queued = true;
        Promise.resolve().then(render);
      }
    };
    render();
    window.__dc = inst;
  }

  window.DCLogic = DCLogic;
  window.TonkpadDC = { boot };
})();
