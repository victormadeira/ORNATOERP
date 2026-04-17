// ═══════════════════════════════════════════════════════
// ORNATO — V4 · Premium Proposal Experience
// Horizontal gallery · Organic timeline · Clip-path reveals
// ═══════════════════════════════════════════════════════

import './style.css';

gsap.registerPlugin(ScrollTrigger);

// ─── Lenis smooth scroll ────────────────────────────
import Lenis from 'lenis';
const lenis = new Lenis({
  duration: 1.2,
  easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
});
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add(time => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const t = document.querySelector(a.getAttribute('href'));
    if (t) lenis.scrollTo(t, { offset: -60 });
  });
});

// ─── PRELOADER ──────────────────────────────────────
function runPreloader() {
  return new Promise(resolve => {
    const fill = document.querySelector('.preloader-fill');
    let prog = 0;

    const interval = setInterval(() => {
      prog += Math.random() * 12 + 5;
      if (prog >= 100) { prog = 100; clearInterval(interval); fill.style.width = '100%'; }
      else fill.style.width = prog + '%';
    }, 100);

    const tl = gsap.timeline({
      onComplete: () => {
        clearInterval(interval);
        fill.style.width = '100%';
        // Dramatic fade out
        gsap.to('#preloader', {
          clipPath: 'inset(0 0 100% 0)',
          duration: .8, ease: 'power3.inOut',
          onComplete: () => {
            document.getElementById('preloader').style.display = 'none';
            resolve();
          }
        });
      }
    });

    // 1) Reveal logo with clip-path (left → right)
    tl.to('.preloader-logo-wrap', {
      clipPath: 'inset(0 0% 0 0)',
      duration: 1.8,
      ease: 'power2.inOut',
    });

    // 2) Brief hold
    tl.to({}, { duration: .6 });
  });
}

// ─── Build smooth S-curve line through timeline dots ──
let timelineScrollTrigger = null;

function buildTimelineLine() {
  const timeline = document.querySelector('.timeline');
  const svg = document.querySelector('.timeline-svg');
  const path = document.querySelector('.timeline-path');
  const dots = document.querySelectorAll('.tl-dot');

  if (!timeline || !svg || !path || dots.length < 2) return;

  // Kill previous ScrollTrigger if rebuilding
  if (timelineScrollTrigger) {
    timelineScrollTrigger.kill();
    timelineScrollTrigger = null;
  }

  const rect = timeline.getBoundingClientRect();
  const points = [];

  dots.forEach(dot => {
    const r = dot.getBoundingClientRect();
    points.push({
      x: r.left - rect.left + r.width / 2,
      y: r.top - rect.top + r.height / 2,
    });
  });

  svg.setAttribute('width', rect.width);
  svg.setAttribute('height', rect.height);
  svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);

  const isMobile = window.innerWidth <= 700;
  const cx = points[0].x;
  const sway = isMobile ? 22 : 50;
  let d = `M${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const midY = (p1.y + p2.y) / 2;
    const dir = (i % 2 === 0) ? -1 : 1;
    const cpX = cx + (dir * sway);

    d += ` C${cpX},${midY} ${cpX},${midY} ${p2.x},${p2.y}`;
  }

  path.setAttribute('d', d);

  const len = path.getTotalLength();
  gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });

  const st = gsap.to(path, {
    strokeDashoffset: 0,
    ease: 'none',
    scrollTrigger: {
      trigger: timeline,
      start: 'top 80%',
      end: 'bottom 20%',
      scrub: 1,
    },
  });
  timelineScrollTrigger = st.scrollTrigger;
}

// Rebuild timeline on resize (debounced)
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(buildTimelineLine, 250);
});

// ─── Horizontal scroll gallery ──────────────────────
function setupHorizontalScroll() {
  const wrap = document.querySelector('.hscroll-wrap');
  const track = document.querySelector('.hscroll-track');
  if (!wrap || !track) return;

  const panels = track.querySelectorAll('.hscroll-panel');
  const totalScroll = track.scrollWidth - window.innerWidth;

  // Main horizontal scroll tween (pinned)
  const scrollTween = gsap.to(track, {
    x: () => -totalScroll,
    ease: 'none',
    scrollTrigger: {
      trigger: wrap,
      start: 'top top',
      end: () => `+=${totalScroll}`,
      pin: true,
      scrub: 1,
      invalidateOnRefresh: true,
    },
  });

  // Each panel fades in as it enters the horizontal viewport
  panels.forEach((panel) => {
    gsap.to(panel, {
      opacity: 1, y: 0,
      duration: 1,
      scrollTrigger: {
        trigger: panel,
        containerAnimation: scrollTween,
        start: 'left 100%',
        end: 'left 60%',
        scrub: true,
      },
    });

    ScrollTrigger.create({
      trigger: panel,
      containerAnimation: scrollTween,
      start: 'left 90%',
      onEnter: () => panel.classList.add('revealed'),
      onLeaveBack: () => panel.classList.remove('revealed'),
    });
  });

}

// ─── PAGE ANIMATIONS ────────────────────────────────
function animatePage() {
  const nav = document.getElementById('nav');
  nav?.classList.add('show');

  ScrollTrigger.create({
    start: 'top -80',
    onUpdate: s => nav?.classList.toggle('scrolled', s.progress > 0),
  });

  // ── Hero entrance ─────────────────────────────
  const heroTl = gsap.timeline({ delay: .15 });
  heroTl.from('.hero-tag', { y: 16, opacity: 0, duration: .7 });
  heroTl.from('.hero-name', { y: 30, opacity: 0, duration: 1, ease: 'power3.out' }, '-=.35');
  heroTl.to('.hero-line', { width: 60, duration: .6 }, '-=.4');
  heroTl.from('.hero-sub', { y: 16, opacity: 0, duration: .7 }, '-=.25');
  heroTl.to('.scroll-cue', { opacity: 1, duration: .5 }, '-=.2');

  // Hero parallax — content fades and lifts on scroll
  gsap.to('.hero-content', {
    y: -40,
    opacity: 0,
    scrollTrigger: {
      trigger: '.hero',
      start: 'top top',
      end: '60% top',
      scrub: 1,
    },
  });

  // ── SplitType reveals ─────────────────────────
  document.querySelectorAll('.anim-text').forEach(el => {
    if (el.closest('.hero')) return;
    if (el.closest('.cta-section')) return;

    const split = new SplitType(el, { types: 'lines, words, chars' });
    gsap.from(split.chars, {
      y: 24, opacity: 0,
      duration: .35, stagger: .02,
      scrollTrigger: { trigger: el, start: 'top 88%' },
    });
  });

  // ── Features — stagger reveal ─────────────────
  gsap.utils.toArray('.feature').forEach((el, i) => {
    gsap.to(el, {
      opacity: 1, y: 0,
      duration: .7, delay: i * .12,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });

  // ── Stats counter ─────────────────────────────
  document.querySelectorAll('.stat-val[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count);
    const obj = { v: 0 };
    gsap.to(obj, {
      v: target, duration: 2.5, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 90%' },
      onUpdate: () => { el.textContent = Math.round(obj.v); },
    });
  });

  // ── Horizontal gallery ────────────────────────
  setupHorizontalScroll();

  // ── Timeline organic line ─────────────────────
  buildTimelineLine();

  // ── Timeline steps — stagger reveal from their side ──
  document.querySelectorAll('.tl-step').forEach((step, i) => {
    gsap.to(step, {
      opacity: 1, x: 0,
      duration: .7, delay: i * .04,
      ease: 'power3.out',
      scrollTrigger: { trigger: step, start: 'top 87%' },
    });
  });

  // ── Timeline dots — activate on scroll ────────
  document.querySelectorAll('.tl-dot').forEach((dot, i) => {
    ScrollTrigger.create({
      trigger: document.querySelectorAll('.tl-step')[i],
      start: 'top 55%',
      end: 'bottom 45%',
      onEnter: () => dot.classList.add('active'),
      onLeaveBack: () => dot.classList.remove('active'),
    });
  });

  // ── Testimonials — stagger reveal ──────────────
  gsap.utils.toArray('.testimonial').forEach((el, i) => {
    gsap.to(el, {
      opacity: 1, y: 0,
      duration: .7, delay: i * .15,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });

  // ── CTA entrance ──────────────────────────────
  const ctaSection = document.querySelector('.cta-section');
  if (ctaSection) {
    const ctaTl = gsap.timeline({
      scrollTrigger: { trigger: ctaSection, start: 'top 85%' },
    });
    ctaTl.from('.cta-tag', { y: 16, opacity: 0, duration: .6, immediateRender: false });
    ctaTl.from('.cta-name', { y: 24, opacity: 0, duration: .8, ease: 'power3.out', immediateRender: false }, '-=.3');
    ctaTl.from('.cta-line', { width: 0, opacity: 0, duration: .5, immediateRender: false }, '-=.3');
    ctaTl.from('.cta-sub', { y: 16, opacity: 0, duration: .6, immediateRender: false }, '-=.2');
    ctaTl.from('.btn-cta', { y: 16, opacity: 0, duration: .6, immediateRender: false }, '-=.2');
  }

  // Footer — no parallax to prevent overscroll
}

// ─── CTA Button ─────────────────────────────────────
function setupCTA() {
  const btn = document.getElementById('btn-proposal');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const colors = ['#C9A96E', '#93614C', '#e8d5a8', '#fff'];

    for (let i = 0; i < 60; i++) {
      const dot = document.createElement('div');
      const sz = 3 + Math.random() * 7;
      dot.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${sz}px;height:${sz}px;background:${colors[~~(Math.random() * colors.length)]};border-radius:${Math.random() > .3 ? '50%' : '2px'};pointer-events:none;z-index:9999`;
      document.body.appendChild(dot);
      const a = Math.PI * 2 * i / 60 + (Math.random() - .5) * .4;
      const v = 100 + Math.random() * 200;
      dot.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * v}px,${Math.sin(a) * v - 100}px) scale(0)`, opacity: 0 },
      ], { duration: 800 + Math.random() * 600, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }).onfinish = () => dot.remove();
    }

    btn.querySelector('.btn-text').textContent = 'REDIRECIONANDO...';
    btn.style.borderColor = '#22c55e';
    btn.style.color = '#22c55e';
    btn.style.pointerEvents = 'none';

    setTimeout(() => {
      btn.querySelector('.btn-text').textContent = 'PROPOSTA ABERTA';
    }, 1500);
  });
}

// ─── INIT ──────────────────────────────────────────
async function init() {
  // Lock scroll during preloader
  lenis.stop();
  document.body.style.overflow = 'hidden';
  window.scrollTo(0, 0);

  await runPreloader();

  // Unlock scroll and reset to top
  window.scrollTo(0, 0);
  document.body.style.overflow = '';
  lenis.start();

  animatePage();
  setupCTA();
}

init();
