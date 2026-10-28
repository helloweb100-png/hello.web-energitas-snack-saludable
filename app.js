/* ==========================================================================
   ENERGITAS - Interacciones
   - Un solo bucle rAF lee el scroll (sin listeners de scroll) y lo suaviza
     para que todas las escenas se muevan con inercia.
   - Three.js solo para los frutos secos 3D; si no carga, la pagina sigue
     funcionando con el resto de efectos.
   ========================================================================== */
(() => {
    'use strict';

    const root = document.documentElement;
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const map = (v, a, b, c, d) => c + (d - c) * clamp((v - a) / (b - a));
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const easeBack = (t) => { const c1 = 1.55, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    const rand = (a, b) => a + Math.random() * (b - a);

    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduce = reduceMQ.matches;
    reduceMQ.addEventListener && reduceMQ.addEventListener('change', (e) => { reduce = e.matches; });
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const WA_PHONE = '526622260599';

    /* ----------------------------------------------------------------------
       Estado global y motor de escenas
       ---------------------------------------------------------------------- */
    const state = {
        y: 0, ys: 0, vel: 0, dir: 1,
        vw: window.innerWidth, vh: window.innerHeight, docH: 0,
        t: 0, dt: 0.016,
        mx: 0, my: 0, sx: 0, sy: 0,          // puntero normalizado (-1..1) y suavizado
        theme: root.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
    };
    const scenes = [];
    const tickers = [];
    const measurers = [];

    function addScene(el, cfg) {
        if (!el) return null;
        const s = Object.assign({ el, top: 0, h: 0, mode: 'free', update() {}, measure() {}, force: true, wasNear: false }, cfg);
        scenes.push(s);
        return s;
    }

    function measureAll() {
        state.vw = window.innerWidth;
        state.vh = window.innerHeight;
        state.docH = root.scrollHeight;
        const sy = window.scrollY;
        scenes.forEach((s) => {
            const r = s.el.getBoundingClientRect();
            s.top = r.top + sy;
            s.h = r.height;
            s.force = true;
            s.measure(s);
        });
        measurers.forEach((fn) => fn());
    }

    let lastT = performance.now();
    function frame(now) {
        requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - lastT) / 1000);
        lastT = now;
        state.t = now / 1000;
        state.dt = dt;

        const y = window.scrollY;
        const prev = state.ys;
        const k = reduce ? 1 : 1 - Math.pow(1 - 0.095, dt * 60);
        state.y = y;
        state.ys += (y - state.ys) * k;
        if (Math.abs(y - state.ys) < 0.08) state.ys = y;
        const v = (state.ys - prev) / Math.max(dt * 60, 0.001);
        state.vel += (v - state.vel) * 0.2;
        if (Math.abs(state.vel) > 0.4) state.dir = state.vel > 0 ? 1 : -1;

        const km = reduce ? 1 : 1 - Math.pow(1 - 0.07, dt * 60);
        state.sx += (state.mx - state.sx) * km;
        state.sy += (state.my - state.sy) * km;

        const ys = state.ys, vh = state.vh;
        for (let i = 0; i < scenes.length; i++) {
            const s = scenes[i];
            const near = ys > s.top - vh * 1.25 && ys < s.top + s.h + vh * 0.25;
            if (!near && !s.force && !s.wasNear) continue;
            let p;
            if (s.mode === 'pinned') p = clamp((ys - s.top) / Math.max(1, s.h - vh));
            else if (s.mode === 'hero') p = clamp(ys / (s.h * 0.9));
            else p = clamp((ys + vh - s.top) / (s.h + vh));
            s.update(p, state, s);
            s.force = false;
            s.wasNear = near;
        }
        for (let i = 0; i < tickers.length; i++) tickers[i](state);
    }

    /* ----------------------------------------------------------------------
       Tema claro / oscuro
       ---------------------------------------------------------------------- */
    function initTheme() {
        const btn = $('#theme-toggle');
        const meta = $('meta[name="theme-color"]');
        const sync = () => {
            const light = state.theme === 'light';
            btn.setAttribute('aria-checked', String(light));
            btn.setAttribute('aria-label', light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
            if (meta) meta.setAttribute('content', light ? '#F3F8EC' : '#07170D');
        };
        sync();
        btn.addEventListener('click', () => {
            state.theme = state.theme === 'light' ? 'dark' : 'light';
            root.setAttribute('data-theme', state.theme);
            try { localStorage.setItem('energitas-theme', state.theme); } catch (e) { /* sin almacenamiento */ }
            sync();
            window.dispatchEvent(new CustomEvent('themechange'));
        });
    }

    /* ----------------------------------------------------------------------
       Grano de pelicula (tile generado en canvas, sin archivos extra)
       ---------------------------------------------------------------------- */
    function initGrain() {
        const el = $('.grain');
        if (!el) return;
        const c = document.createElement('canvas');
        c.width = c.height = 160;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(160, 160);
        for (let i = 0; i < img.data.length; i += 4) {
            const v = (Math.random() * 255) | 0;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
            img.data[i + 3] = (80 + Math.random() * 175) | 0;
        }
        ctx.putImageData(img, 0, 0);
        el.style.setProperty('--grain', `url(${c.toDataURL()})`);
        el.style.backgroundSize = '160px 160px';
    }

    /* ----------------------------------------------------------------------
       Pantalla de carga: progreso real (fuentes + imagenes clave) y cortina
       ---------------------------------------------------------------------- */
    function runLoader() {
        const loader = $('#loader');
        const pct = $('#loader-pct');
        const bar = $('#loader-bar');
        if (!loader) { root.classList.add('is-ready'); return Promise.resolve(); }

        try { history.scrollRestoration = 'manual'; } catch (e) { /* noop */ }
        window.scrollTo(0, 0);
        root.classList.add('is-loading');

        const sources = [
            'img/bolsa-mix-energia.webp', 'img/bolsa-mix-dorado.webp', 'img/bolsa-mix-picante.webp',
            'img/mascota.webp', 'img/logo-energitas.webp',
        ];
        const total = sources.length + 1;
        let loaded = 0;
        const done = () => { loaded++; };
        sources.forEach((src) => {
            const im = new Image();
            im.onload = im.onerror = done;
            im.src = src;
        });
        (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(done, done);

        const MIN = reduce ? 250 : 2400;
        const MAX = 7500;
        const start = performance.now();
        let shown = 0;

        return new Promise((resolve) => {
            const finish = () => {
                pct.textContent = '100';
                bar.style.transform = 'scaleX(1)';
                setTimeout(() => {
                    loader.classList.add('is-out');
                    root.classList.remove('is-loading');
                    setTimeout(() => root.classList.add('is-ready'), reduce ? 0 : 520);
                    setTimeout(() => { loader.remove(); }, 1900);
                    resolve();
                }, reduce ? 0 : 260);
            };
            const tick = (now) => {
                const el = now - start;
                const real = loaded / total;
                const target = Math.min(real, easeOut(clamp(el / MIN)));
                shown += (target - shown) * 0.14;
                pct.textContent = String(Math.round(shown * 100));
                bar.style.transform = `scaleX(${shown.toFixed(4)})`;
                if ((real >= 1 && el >= MIN && shown > 0.992) || el > MAX) finish();
                else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    }

    /* ----------------------------------------------------------------------
       Textos: palabras que suben, revelado por IntersectionObserver
       ---------------------------------------------------------------------- */
    function splitWords(el) {
        const text = el.textContent.trim().replace(/\s+/g, ' ');
        el.textContent = '';
        text.split(' ').forEach((w, i, arr) => {
            const s = document.createElement('span');
            s.className = 'sw';
            const inner = document.createElement('i');
            inner.style.setProperty('--i', i);
            inner.textContent = w;
            s.appendChild(inner);
            el.appendChild(s);
            if (i < arr.length - 1) el.appendChild(document.createTextNode(' '));
        });
    }

    function initReveal() {
        $$('[data-split]').forEach(splitWords);
        // escalonado automatico entre hermanos .rv
        const groups = new Map();
        $$('.rv').forEach((el) => {
            if (el.style.getPropertyValue('--d')) return;
            const list = groups.get(el.parentElement) || [];
            list.push(el);
            groups.set(el.parentElement, list);
        });
        groups.forEach((list) => { if (list.length > 1) list.forEach((el, i) => el.style.setProperty('--d', `${(i * 0.11).toFixed(2)}s`)); });

        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (!e.isIntersecting) return;
                e.target.classList.add('in');
                io.unobserve(e.target);
            });
        }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
        $$('.rv, [data-split]').forEach((el) => io.observe(el));
    }

    /* ----------------------------------------------------------------------
       Enlaces a WhatsApp con mensaje prellenado
       ---------------------------------------------------------------------- */
    function initWhatsApp() {
        $$('[data-msg]').forEach((a) => {
            a.href = `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(a.dataset.msg)}`;
        });
        const wa = $('#wa-float');
        if (wa) {
            setTimeout(() => {
                wa.classList.add('is-tip');
                setTimeout(() => wa.classList.remove('is-tip'), 5200);
            }, 7000);
        }
    }

    /* ----------------------------------------------------------------------
       Navegacion, menu movil, progreso
       ---------------------------------------------------------------------- */
    function initNav() {
        const nav = $('#nav');
        const burger = $('#burger');
        const menu = $('#menu');
        const bar = $('#progress-bar');
        const links = $$('.nav__links a');
        const targets = links.map((a) => ({ a, el: document.getElementById(a.dataset.link), top: 0, h: 0 }));
        let lastY = 0, acc = 0, hidden = false;
        measurers.push(() => targets.forEach((t) => {
            if (!t.el) return;
            const r = t.el.getBoundingClientRect();
            t.top = r.top + window.scrollY;
            t.h = r.height;
        }));

        const setMenu = (open) => {
            menu.classList.toggle('is-open', open);
            menu.setAttribute('aria-hidden', String(!open));
            menu.inert = !open;
            burger.setAttribute('aria-expanded', String(open));
            burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
            root.classList.toggle('is-menu', open);
            document.body.style.overflow = open ? 'hidden' : '';
        };
        menu.inert = true;
        burger.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
        $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
        window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
        window.addEventListener('resize', () => { if (window.innerWidth >= 920) setMenu(false); });

        tickers.push((st) => {
            const y = st.y;
            nav.classList.toggle('is-scrolled', y > 20);
            const d = y - lastY;
            lastY = y;
            acc = Math.sign(d) === Math.sign(acc) ? acc + d : d;
            if (y < 480) { hidden = false; }
            else if (acc > 14) hidden = true;
            else if (acc < -8) hidden = false;
            nav.classList.toggle('is-hidden', hidden);

            const mid = st.ys + st.vh * 0.4;
            targets.forEach((t) => {
                if (t.el) t.a.classList.toggle('is-active', mid >= t.top && mid < t.top + t.h);
            });

            if (bar) bar.style.setProperty('--p', clamp(st.ys / Math.max(1, st.docH - st.vh)).toFixed(4));
        });
    }

    /* ----------------------------------------------------------------------
       Puntero global (paralaje) + efectos de tarjetas + botones magneticos
       ---------------------------------------------------------------------- */
    function initPointer() {
        if (!finePointer) return;
        window.addEventListener('pointermove', (e) => {
            state.mx = (e.clientX / state.vw) * 2 - 1;
            state.my = (e.clientY / state.vh) * 2 - 1;
        }, { passive: true });

        $$('[data-spot]').forEach((el) => {
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                el.style.setProperty('--mx', `${e.clientX - r.left}px`);
                el.style.setProperty('--my', `${e.clientY - r.top}px`);
            });
        });

        if (reduce) return;
        $$('[data-magnetic]').forEach((el) => {
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                const x = e.clientX - (r.left + r.width / 2);
                const y = e.clientY - (r.top + r.height / 2);
                el.style.setProperty('--mx', `${(x * 0.2).toFixed(1)}px`);
                el.style.setProperty('--my', `${(y * 0.28).toFixed(1)}px`);
            });
            el.addEventListener('pointerleave', () => {
                el.style.setProperty('--mx', '0px');
                el.style.setProperty('--my', '0px');
            });
        });
    }

    /* ----------------------------------------------------------------------
       HERO: bolsas con entrada elastica, flotacion, paralaje y salida
       ---------------------------------------------------------------------- */
    const heroState = { ty: 0 };
    function initHero() {
        const hero = $('#inicio');
        const stage = $('[data-stage]');
        const copy = $('[data-hero-copy]');
        if (!hero || !stage) return;
        const bagsWrap = $('.stage__bags', stage);
        const shadow = $('.stage__shadow', stage);
        const ring = $('.stage__ring', stage);
        const mascot = $('.stage__mascot', stage);
        const bags = [
            { el: $('.bag--l', stage), tx: -125, ty: 2, rot: -8, depth: 0.7, delay: 0.5, ph: 1.7, fan: -1 },
            { el: $('.bag--r', stage), tx: 26, ty: 3, rot: 8, depth: 0.8, delay: 0.62, ph: 3.1, fan: 1 },
            { el: $('.bag--c', stage), tx: -50, ty: 0, rot: 0, depth: 1.25, delay: 0.3, ph: 0.2, fan: 0 },
        ];
        let readyAt = null;

        addScene(hero, {
            mode: 'hero',
            update(p, st) {
                if (readyAt === null && root.classList.contains('is-ready')) readyAt = st.t;
                const e = readyAt === null ? -1 : st.t - readyAt;
                const sx = st.sx, sy = st.sy;
                const mobile = st.vw < 768;
                const mxk = mobile ? 0 : 1;

                bags.forEach((b) => {
                    const k = reduce ? (e < 0 ? 0 : 1) : clamp((e - b.delay) / 1.5);
                    const pos = k <= 0 ? 0 : easeBack(k);
                    const bob = Math.sin(st.t * 1.15 + b.ph) * 7;
                    const bobR = Math.sin(st.t * 0.8 + b.ph) * 0.9;
                    const px = sx * 14 * b.depth * mxk;
                    const py = sy * 8 * b.depth * mxk;
                    const rise = (1 - pos) * 95;                 // porcentaje de su propio alto
                    const fanRot = p * 14 * b.fan;
                    const fanX = p * 12 * b.fan;
                    b.el.style.opacity = clamp(k * 2.4).toFixed(3);
                    b.el.style.transform =
                        `translate3d(calc(${b.tx + fanX}% + ${px.toFixed(2)}px), calc(${(b.ty + rise).toFixed(2)}% + ${(bob + py).toFixed(2)}px), 0) rotate(${(b.rot * pos + bobR + fanRot).toFixed(2)}deg)`;
                });

                bagsWrap.style.transform = `rotateY(${(sx * 5 * mxk).toFixed(2)}deg) rotateX(${(-sy * 3 * mxk).toFixed(2)}deg)`;
                shadow.style.transform = `scaleX(${(1 + Math.sin(st.t * 1.15) * 0.04 - p * 0.15).toFixed(3)})`;
                shadow.style.opacity = (clamp(e / 1.2) * (1 - p * 0.8)).toFixed(3);

                heroState.ty = -p * 70;
                stage.style.transform = `translate3d(0, ${heroState.ty.toFixed(1)}px, 0) scale(${(1 - p * 0.1).toFixed(4)})`;
                copy.style.transform = `translate3d(0, ${(-p * 46).toFixed(1)}px, 0)`;
                copy.style.opacity = (1 - clamp(p * 1.35)).toFixed(3);
                ring.style.opacity = (1 - clamp(p * 1.6)).toFixed(3);
                if (mascot) mascot.style.translate = `${(sx * -10 * mxk).toFixed(1)}px ${(p * -26).toFixed(1)}px`;
            },
        });
    }

    /* ----------------------------------------------------------------------
       MARQUEE: velocidad ligada al scroll y direccion segun el sentido
       ---------------------------------------------------------------------- */
    function initMarquee() {
        const el = $('[data-marquee]');
        if (!el) return;
        const track = $('.marquee__track', el);
        let x = 0, half = 0, dir = 1, visible = false;
        const calc = () => { half = track.scrollWidth / 2; };
        measurers.push(calc);
        new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(el);
        tickers.push((st) => {
            if (!visible || reduce || !half) return;
            dir = lerp(dir, st.dir, 0.06);
            x -= (0.9 + Math.abs(st.vel) * 0.55) * dir * (st.dt * 60);
            if (x <= -half) x += half;
            if (x > 0) x -= half;
            track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
        });
    }

    /* ----------------------------------------------------------------------
       MANIFIESTO: las palabras se encienden con el scroll
       ---------------------------------------------------------------------- */
    function initMani() {
        const sec = $('#manifiesto');
        const txt = $('[data-words]');
        if (!sec || !txt) return;
        const words = [];
        const wrap = (node) => {
            if (node.nodeType === 3) {
                const frag = document.createDocumentFragment();
                node.textContent.split(/(\s+)/).forEach((part) => {
                    if (!part) return;
                    if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
                    const s = document.createElement('span');
                    s.className = 'w';
                    s.textContent = part;
                    frag.appendChild(s);
                    words.push(s);
                });
                node.parentNode.replaceChild(frag, node);
            } else if (node.nodeType === 1) {
                Array.from(node.childNodes).forEach(wrap);
            }
        };
        Array.from(txt.childNodes).forEach(wrap);
        const last = new Array(words.length).fill(-1);
        const mascot = $('.mani__mascot', sec);

        addScene(sec, {
            mode: 'pinned',
            update(p) {
                const f = map(p, 0.06, 0.78, 0, words.length);
                for (let i = 0; i < words.length; i++) {
                    const o = reduce ? 1 : 0.16 + 0.84 * clamp(f - i);
                    const q = Math.round(o * 50);
                    if (q !== last[i]) { words[i].style.opacity = (q / 50).toFixed(2); last[i] = q; }
                }
                if (mascot) mascot.style.translate = `0 ${((0.5 - p) * 60).toFixed(1)}px`;
            },
        });
    }

    /* ----------------------------------------------------------------------
       MEZCLAS: carrusel 3D y paneles guiados por el scroll
       ---------------------------------------------------------------------- */
    function initMix() {
        const sec = $('#mezclas');
        if (!sec) return;
        const stage = $('.mix__stage', sec);
        const bags = $$('.mbag', sec);
        const panels = $$('.panel', sec);
        const tints = $$('.mix__tints i', sec);
        const rail = $$('.rail__btn', sec);
        let stageW = 400, active = -1;

        const measure = () => { stageW = stage.clientWidth || 400; };
        measurers.push(measure);

        const posOf = (p) => {
            const lin = p * 2;
            const i = Math.min(2, Math.floor(lin));
            const f = lin - i;
            return i >= 2 ? 2 : i + easeIO(clamp((f - 0.36) / 0.28));
        };
        const targetP = [0.05, 0.5, 0.95];
        rail.forEach((b, i) => b.addEventListener('click', () => {
            const sc = scenes.find((s) => s.el === sec);
            window.scrollTo({ top: sc.top + targetP[i] * (sc.h - state.vh), behavior: reduce ? 'auto' : 'smooth' });
        }));

        addScene(sec, {
            mode: 'pinned',
            update(p, st) {
                const a = posOf(p);
                const mobile = st.vw < 900;
                const spread = stageW * (mobile ? 0.58 : 0.5);
                bags.forEach((b, i) => {
                    const o = i - a, ao = Math.abs(o);
                    const near = Math.min(ao, 1.35);
                    const x = o * spread;
                    const s = 1 - 0.3 * near;
                    const bob = Math.sin(st.t * 1.2 + i * 1.9) * (ao < 0.5 ? 7 : 3);
                    b.style.transform = `translate3d(calc(-50% + ${x.toFixed(1)}px), ${bob.toFixed(1)}px, ${(-near * 80).toFixed(0)}px) rotateY(${(-o * 26).toFixed(1)}deg) scale(${s.toFixed(3)})`;
                    b.style.opacity = (1 - 0.62 * Math.min(ao, 1)).toFixed(3);
                    b.style.zIndex = String(10 - Math.round(ao * 4));
                });
                panels.forEach((pn, i) => {
                    const o = i - a;
                    const v = clamp(1 - Math.abs(o) * 2.4);
                    pn.style.opacity = v.toFixed(3);
                    pn.style.transform = `translate3d(0, ${(o * 34).toFixed(1)}px, 0)`;
                    pn.style.visibility = v < 0.02 ? 'hidden' : 'visible';
                });
                const idx = Math.round(a);
                if (idx !== active) {
                    active = idx;
                    tints.forEach((t, i) => t.classList.toggle('is-on', i === idx));
                    rail.forEach((b, i) => { b.classList.toggle('is-on', i === idx); if (i === idx) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
                }
            },
        });
    }

    /* ----------------------------------------------------------------------
       TIENDA: la imagen se abre hasta ocupar toda la pantalla
       ---------------------------------------------------------------------- */
    function initShop() {
        const sec = $('#tienda');
        if (!sec) return;
        const frame = $('.shop__frame', sec);
        const img = $('img', frame);
        const wl = $('.shop__w--l', sec);
        const wr = $('.shop__w--r', sec);
        const cap = $('.shop__cap', sec);
        let rw = 280, rh = 320, fh = 520, eh = 520, yE = 0;

        const measure = () => {
            const portrait = state.vh > state.vw;
            rw = portrait ? state.vw * 0.66 : Math.min(state.vw * 0.3, 420);
            rh = portrait ? state.vh * 0.36 : Math.min(state.vh * 0.58, rw * 1.3);
            fh = Math.min(state.vh * 0.6, state.vw * 1.5);
            // cuadro final: en horizontal respeta la proporcion de la foto (letrero completo);
            // en vertical ocupa todo el ancho y la camara recorre el letrero
            eh = portrait ? fh : Math.min(state.vh, state.vw / (1600 / 740));
            yE = (state.vh - eh) / 2;
            sec.classList.toggle('is-portrait', portrait);
            sec.classList.toggle('has-below', portrait || yE >= 92);
            sec.style.setProperty('--rw', `${rw}px`);
            sec.style.setProperty('--rh', `${rh}px`);
            sec.style.setProperty('--eh', `${eh}px`);
        };
        measurers.push(measure);

        addScene(sec, {
            mode: 'pinned',
            update(p, st) {
                const e = easeIO(clamp(p / 0.56));
                const portrait = st.vh > st.vw;
                const x0 = (st.vw - rw) / 2, y0 = (st.vh - rh) / 2;
                const xi = x0 * (1 - e), yi = lerp(y0, yE, e), r = 28 * (1 - e);
                frame.style.clipPath = `inset(${yi.toFixed(1)}px ${xi.toFixed(1)}px ${yi.toFixed(1)}px ${xi.toFixed(1)}px round ${r.toFixed(1)}px)`;
                img.style.top = `${yE.toFixed(1)}px`;
                img.style.height = `${eh.toFixed(1)}px`;
                img.style.transform = `scale(${(1.22 - 0.22 * e).toFixed(4)})`;
                img.style.objectPosition = portrait ? `${lerp(6, 76, easeIO(p)).toFixed(1)}% 50%` : '50% 50%';
                cap.style.paddingBottom = sec.classList.contains('has-below') ? '0px' : `${(yE + Math.max(26, st.vh * 0.04)).toFixed(0)}px`;

                const q = clamp(p / 0.34);
                const dx = portrait ? 0 : q * st.vw * 0.42;
                const dy = portrait ? q * st.vh * 0.3 : 0;
                wl.style.transform = `translate3d(${(-dx).toFixed(1)}px, ${(-dy).toFixed(1)}px, 0)`;
                wr.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
                wl.style.opacity = wr.style.opacity = (1 - clamp(q * 1.15)).toFixed(3);

                const c = clamp((p - 0.62) / 0.22);
                cap.style.opacity = c.toFixed(3);
                cap.style.transform = `translate3d(0, ${((1 - c) * 36).toFixed(1)}px, 0)`;
            },
        });
    }

    /* ----------------------------------------------------------------------
       EMPRENDE: la linea se llena y los pasos se encienden
       ---------------------------------------------------------------------- */
    function initBiz() {
        const list = $('[data-steps]');
        if (!list) return;
        const items = $$('.step', list);
        let tops = [], top = 0, h = 1;
        const measure = () => {
            const r = list.getBoundingClientRect();
            top = r.top + window.scrollY;
            h = r.height;
            tops = items.map((li) => { const b = li.getBoundingClientRect(); return b.top + window.scrollY + b.height * 0.35; });
        };
        measurers.push(measure);
        addScene($('#emprende'), {
            mode: 'free',
            update(p, st) {
                const line = st.ys + st.vh * 0.58;
                list.style.setProperty('--p', clamp((line - top - 20) / Math.max(1, h - 40)).toFixed(4));
                items.forEach((li, i) => li.classList.toggle('is-on', line > tops[i]));
            },
        });
    }

    /* ----------------------------------------------------------------------
       Contador del bento
       ---------------------------------------------------------------------- */
    function initCounters() {
        $$('[data-count]').forEach((el) => {
            const target = parseInt(el.dataset.count, 10);
            el.textContent = '0';
            const io = new IntersectionObserver(([e]) => {
                if (!e.isIntersecting) return;
                io.disconnect();
                if (reduce) { el.textContent = String(target); return; }
                const t0 = performance.now(), dur = 1700;
                const step = (now) => {
                    const k = clamp((now - t0) / dur);
                    el.textContent = String(Math.round(easeOut(k) * target));
                    if (k < 1) requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
            }, { threshold: 0.5 });
            io.observe(el);
        });
    }

    /* ----------------------------------------------------------------------
       FAQ: acordeon animado sobre <details>
       ---------------------------------------------------------------------- */
    function initFaq() {
        const items = $$('.qa');
        const close = (qa) => {
            qa.classList.remove('is-open');
            setTimeout(() => { if (!qa.classList.contains('is-open')) qa.removeAttribute('open'); }, reduce ? 0 : 620);
        };
        items.forEach((qa) => {
            const sum = $('summary', qa);
            sum.addEventListener('click', (e) => {
                e.preventDefault();
                if (qa.classList.contains('is-open')) { close(qa); return; }
                items.forEach((o) => { if (o !== qa && o.classList.contains('is-open')) close(o); });
                qa.setAttribute('open', '');
                requestAnimationFrame(() => requestAnimationFrame(() => qa.classList.add('is-open')));
            });
        });
    }

    /* ----------------------------------------------------------------------
       Formulario de pedido -> WhatsApp
       ---------------------------------------------------------------------- */
    function initForm() {
        const form = $('#order-form');
        if (!form) return;
        const status = $('#form-status');
        const label = $('.form__label', form);
        const btn = $('.form__submit', form);
        const nameInput = $('#f-name');
        const nameErr = $('#f-name-err');
        const defaultLabel = label.textContent;

        $$('.mixrow', form).forEach((row) => {
            const out = $('output', row);
            row.addEventListener('click', (e) => {
                const b = e.target.closest('[data-step]');
                if (!b) return;
                const v = clamp(parseInt(out.textContent, 10) + parseInt(b.dataset.step, 10), 0, 99);
                out.textContent = String(v);
                row.classList.toggle('has-qty', v > 0);
            });
        });

        nameInput.addEventListener('input', () => {
            nameInput.parentElement.classList.remove('is-invalid');
            nameErr.textContent = '';
            nameInput.removeAttribute('aria-invalid');
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = nameInput.value.trim();
            if (!name) {
                nameInput.parentElement.classList.add('is-invalid');
                nameInput.setAttribute('aria-invalid', 'true');
                nameErr.textContent = 'Cuéntanos tu nombre para saludarte.';
                nameInput.focus();
                return;
            }
            const city = $('#f-city').value.trim();
            const extra = $('#f-msg').value.trim();
            const sell = $('#uso-vender').checked;
            const items = $$('.mixrow', form)
                .map((r) => ({ n: r.dataset.mix, q: parseInt($('output', r).textContent, 10) }))
                .filter((i) => i.q > 0);

            const lines = [`Hola Energitas, soy *${name}*${city ? ` de ${city}` : ''}.`];
            lines.push(sell ? 'Quiero ser *distribuidor* y empezar a vender Energitas.' : 'Mi pedido es para consumo personal.');
            if (items.length) {
                lines.push('', 'Quiero:');
                items.forEach((i) => lines.push(`- ${i.q} ${i.q === 1 ? 'bolsa' : 'bolsas'} de ${i.n}`));
            } else {
                lines.push('', '¿Me compartes las mezclas disponibles y los precios?');
            }
            if (extra) lines.push('', extra);
            const url = `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(lines.join('\n'))}`;

            btn.disabled = true;
            label.textContent = 'Abriendo WhatsApp...';
            status.textContent = '';
            const w = window.open(url, '_blank', 'noopener');
            setTimeout(() => {
                form.classList.add('is-sent');
                status.innerHTML = w
                    ? `Listo, tu pedido va en camino. Si no se abrió, <a href="${url}" target="_blank" rel="noopener">toca aquí</a>.`
                    : `Tu navegador bloqueó la ventana. <a href="${url}" target="_blank" rel="noopener">Toca aquí para abrir WhatsApp</a>.`;
                label.textContent = '¡Pedido enviado!';
                setTimeout(() => { btn.disabled = false; label.textContent = defaultLabel; form.classList.remove('is-sent'); }, 6000);
            }, 700);
        });
    }

    /* ----------------------------------------------------------------------
       Zonas tranquilas: los frutos 3D bajan su opacidad sobre texto largo
       ---------------------------------------------------------------------- */
    const calm = { target: 1, value: 1, zones: [] };
    function initCalm() {
        const canvas = $('#fx-nuts');
        $$('[data-calm]').forEach((el) => {
            const z = { el, v: parseFloat(el.dataset.calm), top: 0, h: 0 };
            calm.zones.push(z);
        });
        measurers.push(() => calm.zones.forEach((z) => { const r = z.el.getBoundingClientRect(); z.top = r.top + window.scrollY; z.h = r.height; }));
        tickers.push((st) => {
            const mid = st.ys + st.vh * 0.5;
            let t = 1;
            calm.zones.forEach((z) => { if (mid > z.top - st.vh * 0.2 && mid < z.top + z.h + st.vh * 0.2) t = Math.min(t, z.v); });
            calm.value += (t - calm.value) * 0.06;
            if (canvas) canvas.style.opacity = calm.value.toFixed(3);
        });
    }

    /* ----------------------------------------------------------------------
       Particulas (polvo luminoso) en canvas 2D
       ---------------------------------------------------------------------- */
    function initDust() {
        const cv = $('#fx-dust');
        if (!cv) return;
        const ctx = cv.getContext('2d');
        let W = 0, H = 0, dpr = 1, parts = [], sprites = {};

        const buildSprites = () => {
            const mk = (rgb) => {
                const c = document.createElement('canvas');
                c.width = c.height = 64;
                const g = c.getContext('2d');
                const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
                grad.addColorStop(0, `rgba(${rgb},1)`);
                grad.addColorStop(0.28, `rgba(${rgb},0.55)`);
                grad.addColorStop(1, `rgba(${rgb},0)`);
                g.fillStyle = grad;
                g.fillRect(0, 0, 64, 64);
                return c;
            };
            const light = state.theme === 'light';
            sprites = { g: mk(light ? '20,130,60' : '120,225,130'), y: mk(light ? '214,160,0' : '246,201,14') };
        };
        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            W = cv.width = Math.round(window.innerWidth * dpr);
            H = cv.height = Math.round(window.innerHeight * dpr);
            const n = window.innerWidth < 768 ? 34 : 72;
            parts = Array.from({ length: n }, () => ({
                x: Math.random(), y: Math.random(), z: rand(0.25, 1),
                s: rand(0.4, 1.4), ph: rand(0, 6.28), gold: Math.random() < 0.32,
            }));
        };
        buildSprites();
        resize();
        window.addEventListener('resize', resize);
        window.addEventListener('themechange', buildSprites);

        const draw = (st) => {
            ctx.clearRect(0, 0, W, H);
            const light = st.theme === 'light';
            const vh = st.vh;
            for (let i = 0; i < parts.length; i++) {
                const p = parts[i];
                const tw = 0.5 + 0.5 * Math.sin(st.t * p.s * 1.4 + p.ph);
                let sy = (p.y * vh - st.ys * p.z * 0.35 - st.t * 12 * p.z * p.s) % vh;
                if (sy < 0) sy += vh;
                const sx = p.x * st.vw + Math.sin(st.t * 0.3 * p.s + p.ph) * 22 * p.z + st.sx * 24 * p.z;
                const size = (6 + p.z * 22) * dpr;
                ctx.globalAlpha = (light ? 0.5 : 0.8) * (0.25 + 0.75 * tw) * p.z;
                ctx.drawImage(p.gold ? sprites.y : sprites.g, sx * dpr - size / 2, sy * dpr - size / 2, size, size);
            }
            ctx.globalAlpha = 1;
        };
        if (reduce) { draw(state); return; }
        tickers.push(draw);
    }

    /* ----------------------------------------------------------------------
       Frutos secos 3D (Three.js): nueces, almendras, cacahuates, semillas...
       ---------------------------------------------------------------------- */
    function initNuts() {
        const canvas = $('#fx-nuts');
        const T = window.THREE;
        if (!canvas || !T) return;
        // con movimiento reducido no hay capa 3D: una imagen congelada fija sobre el texto estorbaria
        if (reduce) { canvas.style.display = 'none'; return; }
        let renderer;
        try {
            renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
        } catch (err) { return; }

        const FOV = 30;
        renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        const scene3 = new T.Scene();
        const camera = new T.PerspectiveCamera(FOV, 1, 10, 9000);
        let W = 1, H = 1, D = 1000;

        scene3.add(new T.HemisphereLight(0xeaffe6, 0x16341f, 1.5));
        const key = new T.DirectionalLight(0xfff0cf, 3.2); key.position.set(-420, 620, 800); scene3.add(key);
        const rim = new T.DirectionalLight(0x7dffa0, 1.8); rim.position.set(640, -260, -500); scene3.add(rim);

        /* textura de grano para bump (ruido de valor suavizado, sin ctx.filter) */
        const nc = document.createElement('canvas');
        nc.width = nc.height = 128;
        const nctx = nc.getContext('2d');
        const small = document.createElement('canvas');
        small.width = small.height = 24;
        const sctx = small.getContext('2d');
        const sd = sctx.createImageData(24, 24);
        for (let i = 0; i < sd.data.length; i += 4) { const v = (Math.random() * 255) | 0; sd.data[i] = sd.data[i + 1] = sd.data[i + 2] = v; sd.data[i + 3] = 255; }
        sctx.putImageData(sd, 0, 0);
        nctx.imageSmoothingEnabled = true;
        nctx.imageSmoothingQuality = 'high';
        nctx.drawImage(small, 0, 0, 128, 128);
        const bump = new T.CanvasTexture(nc);
        bump.wrapS = bump.wrapT = T.RepeatWrapping;
        bump.repeat.set(2, 2);

        const mat = (color, rough, bs) => new T.MeshStandardMaterial({ color, roughness: rough, metalness: 0.03, bumpMap: bump, bumpScale: bs });

        const lathe = (fn, steps, seg) => {
            const pts = [];
            for (let i = 0; i <= steps; i++) { const [r, y] = fn(i / steps); pts.push(new T.Vector2(Math.max(r, 0.0001), y)); }
            return new T.LatheGeometry(pts, seg);
        };
        const displace = (geo, fn) => {
            const pos = geo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                const d = fn(x, y, z);
                const l = Math.hypot(x, y, z) || 1;
                pos.setXYZ(i, x + (x / l) * d, y + (y / l) * d, z + (z / l) * d);
            }
            geo.computeVertexNormals();
            return geo;
        };
        const wob = (x, y, z, f) => Math.sin(x * f + 1.2) * Math.sin(y * f * 0.9 + 0.4) * Math.sin(z * f * 1.1 + 2.1);

        const geos = {
            almond: lathe((t) => [0.55 * Math.pow(Math.sin(Math.PI * t), 0.8) * (1 - 0.45 * Math.pow(t, 1.5)), (t - 0.5) * 2], 26, 20),
            pumpkin: lathe((t) => [0.62 * Math.pow(Math.sin(Math.PI * t), 0.7) * (1 - 0.5 * t), (t - 0.5) * 1.9], 24, 22),
            sunflower: lathe((t) => [0.46 * Math.pow(Math.sin(Math.PI * t), 0.85) * (1 - 0.35 * t), (t - 0.5) * 2], 22, 18),
            peanut: lathe((t) => [0.5 * Math.pow(Math.sin(Math.PI * t), 0.55) * (1 - 0.26 * Math.exp(-Math.pow((t - 0.5) / 0.12, 2))), (t - 0.5) * 2.1], 30, 22),
            pecan: lathe((t) => [0.5 * Math.pow(Math.sin(Math.PI * t), 0.9), (t - 0.5) * 2.2], 24, 24),
            walnut: new T.SphereGeometry(1, 40, 28),
            raisin: new T.SphereGeometry(1, 20, 14),
        };
        geos.almond.scale(1, 1, 0.74);
        geos.pumpkin.scale(1, 1, 0.2);
        geos.sunflower.scale(1, 1, 0.34);
        geos.peanut.scale(1, 1, 0.92);
        displace(geos.pecan, (x, y, z) => 0.06 * Math.sin(Math.atan2(z, x) * 4) + 0.03 * wob(x, y, z, 6));
        displace(geos.walnut, (x, y, z) => 0.1 * wob(x, y, z, 3.2) + 0.08 * Math.abs(Math.sin(x * 4.2) * Math.sin(y * 3.6 + 0.6)) + 0.05 * wob(x, y, z, 9) + 0.07 * Math.exp(-x * x * 26) - 0.06);
        displace(geos.raisin, (x, y, z) => 0.16 * wob(x, y, z, 5.5) + 0.08 * wob(x, y, z, 11));
        geos.walnut.scale(1, 0.92, 0.82);
        geos.raisin.scale(1, 0.82, 0.74);
        geos.almond.computeVertexNormals();

        const TYPES = [
            { g: geos.walnut, m: [mat(0x9a6f42, 0.85, 2.4), mat(0x835a35, 0.88, 2.4)], size: [40, 62], w: 3 },
            { g: geos.almond, m: [mat(0x9c6335, 0.7, 0.9), mat(0xb27c46, 0.72, 0.9)], size: [38, 58], w: 8 },
            { g: geos.peanut, m: [mat(0xdcaa68, 0.6, 0.6), mat(0xcf9a58, 0.62, 0.6)], size: [30, 46], w: 7 },
            { g: geos.pumpkin, m: [mat(0x6f9c3b, 0.55, 0.7), mat(0x8ab34c, 0.55, 0.7)], size: [32, 48], w: 7 },
            { g: geos.sunflower, m: [mat(0x3a3935, 0.6, 0.5), mat(0x58564e, 0.6, 0.5)], size: [24, 36], w: 5 },
            { g: geos.raisin, m: [mat(0x3b2034, 0.55, 1.4)], size: [15, 25], w: 6 },
            { g: geos.pecan, m: [mat(0x7c4628, 0.62, 0.9), mat(0x5f3421, 0.65, 0.9)], size: [40, 60], w: 5 },
        ];
        const pool = [];
        TYPES.forEach((t) => { for (let i = 0; i < t.w; i++) pool.push(t); });

        const nuts = [];
        const mobile = window.innerWidth < 768;
        const build = (kind, n, extra) => {
            for (let i = 0; i < n; i++) {
                const tp = pool[(Math.random() * pool.length) | 0];
                const mesh = new T.Mesh(tp.g, tp.m[(Math.random() * tp.m.length) | 0]);
                mesh.rotation.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
                scene3.add(mesh);
                const base = rand(tp.size[0], tp.size[1]);
                nuts.push(Object.assign({
                    mesh, kind, base, i, n,
                    rv: [rand(-0.7, 0.7), rand(-0.9, 0.9), rand(-0.6, 0.6)],
                    ph: rand(0, 6.28), sp: rand(0.25, 0.7),
                }, extra()));
            }
        };
        const mScale = mobile ? 0.62 : 1;
        // distribuidos por toda la pagina con paralaje por profundidad
        build('world', mobile ? 9 : 22, () => {
            const side = Math.random() < 0.5 ? -1 : 1;
            return {
                f: rand(0.55, 1.5), sFrac: rand(0.05, 1.05), yFrac: rand(0.15, 0.85),
                xFrac: mobile ? rand(0.03, 0.97) : 0.5 + side * rand(0.445, 0.505),
                scale: rand(0.8, 1.1) * mScale,
            };
        });
        // orbitan alrededor de las bolsas del hero
        build('hero', mobile ? 6 : 10, () => ({
            a0: rand(0, 6.28), rr: rand(0.88, 1.18), spd: rand(0.16, 0.3) * (Math.random() < 0.5 ? -1 : 1), scale: rand(0.85, 1.3) * mScale,
        }));
        // convergen en el cierre
        build('final', mobile ? 7 : 12, () => ({
            a0: rand(0, 6.28), rr: rand(0.85, 1.2), spd: rand(0.1, 0.22) * (Math.random() < 0.5 ? -1 : 1), scale: rand(0.9, 1.5) * mScale,
        }));

        const lay = { hero: { cx: 0, cy: 0, rx: 300, ry: 260 }, final: { cx: 0, cy: 0, rx: 500, ry: 280 }, maxS: 1 };
        const stageEl = $('[data-stage]');
        const finalEl = $('[data-final-anchor]');
        const place = (n, sx, sy, z, st) => {
            const m = n.mesh;
            const k = (D - z) / D;
            m.position.set((sx - W / 2) * k, -(sy - H / 2) * k, z);
            m.scale.setScalar(n.base * n.scale);
        };

        const measure = () => {
            W = window.innerWidth; H = window.innerHeight;
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
            renderer.setSize(W, H, false);
            D = (H / 2) / Math.tan((FOV * Math.PI) / 360);
            camera.aspect = W / H;
            camera.position.set(0, 0, D);
            camera.far = D * 4;
            camera.updateProjectionMatrix();
            const sy = window.scrollY;
            if (stageEl) {
                const r = stageEl.getBoundingClientRect();
                lay.hero.cx = r.left + r.width / 2;
                lay.hero.cy = r.top + r.height / 2 + sy - (heroState.ty || 0);
                lay.hero.rx = r.width * 0.6;
                lay.hero.ry = r.height * 0.5;
            }
            if (finalEl) {
                const r = finalEl.getBoundingClientRect();
                lay.final.cx = r.left + r.width / 2;
                lay.final.cy = r.top + r.height / 2 + sy;
                lay.final.rx = Math.min(W * 0.46, 660);
                lay.final.ry = Math.min(H * 0.36, 320);
            }
            lay.maxS = Math.max(1, state.docH - H);
            if (reduce) renderFrame(state);
        };
        measurers.push(measure);

        const renderFrame = (st) => {
            const t = st.t, ys = st.ys;
            const sp = reduce ? 0 : 1;
            let any = false;
            for (let i = 0; i < nuts.length; i++) {
                const n = nuts[i];
                let sx, sy, z, vis = true;
                if (n.kind === 'world') {
                    sy = H * n.yFrac + (n.sFrac * lay.maxS - ys) * n.f;
                    sx = n.xFrac * W + Math.sin(t * n.sp + n.ph) * 16 * sp + st.sx * (n.f - 0.4) * 46 * sp;
                    sy += Math.cos(t * n.sp * 0.8 + n.ph) * 12 * sp;
                    z = (n.f - 1) * 360;
                    vis = sy > -140 && sy < H + 140;
                } else {
                    const L = n.kind === 'hero' ? lay.hero : lay.final;
                    const a = n.a0 + t * n.spd * sp;
                    const ring = n.kind === 'hero' ? n.rr : n.rr;
                    sx = L.cx + Math.cos(a) * L.rx * ring + st.sx * 18 * sp;
                    sy = L.cy - ys + Math.sin(a) * L.ry * ring + Math.sin(t * 0.9 + n.ph) * 8 * sp;
                    if (n.kind === 'hero') sy += heroState.ty;
                    z = Math.sin(a) * 240;
                    vis = sy > -160 && sy < H + 160;
                }
                n.mesh.visible = vis;
                if (!vis) continue;
                any = true;
                place(n, sx, sy, z, st);
                const boost = 1 + Math.min(Math.abs(st.vel) * 0.05, 2.2);
                n.mesh.rotation.x += n.rv[0] * st.dt * boost * sp;
                n.mesh.rotation.y += n.rv[1] * st.dt * boost * sp;
                n.mesh.rotation.z += n.rv[2] * st.dt * boost * sp;
            }
            if (any || canvas.dataset.had === '1') {
                renderer.render(scene3, camera);
                canvas.dataset.had = any ? '1' : '0';
            }
        };

        if (!reduce) tickers.push(renderFrame);
        window.addEventListener('themechange', () => { if (reduce) renderFrame(state); });
    }

    /* ----------------------------------------------------------------------
       Arranque
       ---------------------------------------------------------------------- */
    function boot() {
        initTheme();
        initGrain();
        initWhatsApp();
        initReveal();
        initNav();
        initPointer();
        initHero();
        initMarquee();
        initMani();
        initMix();
        initShop();
        initBiz();
        initCounters();
        initFaq();
        initForm();
        initCalm();
        initDust();
        initNuts();

        const refresh = () => measureAll();
        refresh();
        let rt;
        const later = () => { clearTimeout(rt); rt = setTimeout(refresh, 160); };
        window.addEventListener('resize', later);
        window.addEventListener('load', refresh);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
        if ('ResizeObserver' in window) new ResizeObserver(later).observe(document.body);

        requestAnimationFrame((t) => { lastT = t; frame(t); });

        runLoader().then(() => {
            refresh();
            const hash = location.hash && location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null;
            if (hash) setTimeout(() => hash.scrollIntoView(), 80);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
