import { animate, inView, stagger, type AnimationOptions } from 'motion';

export type MotionIntensity = 'off' | 'subtle' | 'full';

const STAGGER_DELAY_S = 0.045;
const COUNT_DURATION_S = 0.65;
const DRAWER_DURATION_S = 0.18;
const DRAWER_OFFSET_PX = 20;
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const SIDEBAR_STORAGE_KEY = 'strata-sidebar-collapsed';

const TRANSITION_BY_INTENSITY = {
  full: { duration: 0.32, offsetY: 16, scaleStart: 0.95 },
  subtle: { duration: 0.18, offsetY: 8, scaleStart: 0.98 },
} as const;

export function getMotionIntensity(): MotionIntensity {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'off';
  const mode = document.documentElement.dataset.motion;
  return mode === 'off' || mode === 'subtle' ? mode : 'full';
}

export function isMotionEnabled(): boolean {
  return getMotionIntensity() !== 'off';
}

function getTransitionConfig() {
  const intensity = getMotionIntensity();
  return TRANSITION_BY_INTENSITY[intensity === 'subtle' ? 'subtle' : 'full'];
}

function revealImmediately(el: HTMLElement): void {
  el.dataset.animated = 'true';
  el.style.opacity = '1';
  el.style.transform = '';
}

function runElementReveal(el: HTMLElement): void {
  if (el.dataset.animated === 'true') return;
  const variant = el.dataset.animate ?? 'fade-up';
  const { duration, offsetY, scaleStart } = getTransitionConfig();
  const options: AnimationOptions = { duration, ease: EASE_OUT };

  el.dataset.animated = 'true';
  const keyframes = variant === 'fade-in'
    ? { opacity: [0, 1] }
    : variant === 'scale-in'
      ? { opacity: [0, 1], scale: [scaleStart, 1] }
      : { opacity: [0, 1], y: [offsetY, 0] };
  animate(el, keyframes, options);
}

function initAnimateElements(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-animate]');
  if (!isMotionEnabled()) { elements.forEach(revealImmediately); return; }
  elements.forEach((el) => {
    if (el.closest('[data-stagger]') && el.hasAttribute('data-stagger-item')) return;
    inView(el, () => runElementReveal(el), { amount: 'some' });
  });
}

function initStaggerContainers(): void {
  const { duration, offsetY } = getTransitionConfig();
  document.querySelectorAll<HTMLElement>('[data-stagger]').forEach((container) => {
    const items = Array.from(container.querySelectorAll<HTMLElement>('[data-stagger-item]'));
    if (items.length === 0) return;
    if (!isMotionEnabled()) { items.forEach(revealImmediately); return; }
    inView(container, () => {
      items.forEach((item) => { item.dataset.animated = 'true'; });
      animate(items, { opacity: [0, 1], y: [offsetY, 0] }, { duration, delay: stagger(STAGGER_DELAY_S), ease: EASE_OUT });
    }, { amount: 'some' });
  });
}

function initCountUpElements(): void {
  document.querySelectorAll<HTMLElement>('[data-count-to]').forEach((el) => {
    const match = (el.textContent ?? '').trim().match(/^([^\d-]*)(-?[\d,.\s]+)(.*)$/);
    const prefix = el.dataset.countPrefix ?? match?.[1] ?? '';
    const suffix = el.dataset.countSuffix ?? match?.[3] ?? '';
    const rawTarget = (el.dataset.countTo ?? match?.[2] ?? '0').replace(/[,\s]/g, '');
    const parsed = Number.parseFloat(rawTarget);
    const target = Number.isFinite(parsed) ? parsed : 0;
    const decimals = el.dataset.countDecimals ? Number.parseInt(el.dataset.countDecimals, 10) : (rawTarget.split('.')[1]?.length ?? 0);
    const formatter = new Intl.NumberFormat(document.documentElement.lang || undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    const render = (value: number): void => { el.textContent = `${prefix}${formatter.format(value)}${suffix}`; };
    if (!isMotionEnabled()) render(target);
    else inView(el, () => { animate(0, target, { duration: COUNT_DURATION_S, ease: EASE_OUT, onUpdate: render }); }, { amount: 'some' });
  });
}

export function updateNavIndicators(): void {
  const { duration } = getTransitionConfig();
  document.querySelectorAll<HTMLElement>('[data-tab-list]').forEach((list) => {
    const indicator = list.querySelector<HTMLElement>('[data-nav-indicator]');
    const active = list.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"], .is-active, .active');
    if (!indicator || !active) return;

    const left = active.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
    const width = active.getBoundingClientRect().width;
    if (!isMotionEnabled() || indicator.dataset.indicatorReady !== 'true') {
      indicator.style.transform = `translateX(${left}px)`;
      indicator.style.width = `${width}px`;
      indicator.dataset.indicatorReady = 'true';
      return;
    }
    animate(indicator, { x: left, width }, { duration, ease: EASE_OUT });
  });
}

function initSidebarToggle(): void {
  const toggles = document.querySelectorAll<HTMLElement>('[data-sidebar-toggle]');
  const sidebar = document.querySelector<HTMLElement>('[data-sidebar]');
  if (toggles.length === 0 && !sidebar) return;

  const applyState = (state: 'collapsed' | 'expanded'): void => {
    const collapsed = state === 'collapsed';
    document.documentElement.dataset.sidebarCollapsed = String(collapsed);
    sidebar?.setAttribute('data-collapsed', String(collapsed));
    toggles.forEach((btn) => btn.setAttribute('aria-expanded', String(!collapsed)));
    try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed)); } catch { /* ignore */ }
  };

  let stored = false;
  try { stored = localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'; } catch { /* ignore */ }
  applyState(stored ? 'collapsed' : 'expanded');

  toggles.forEach((btn) => {
    if (btn.dataset.sidebarBound === 'true') return;
    btn.dataset.sidebarBound = 'true';
    btn.addEventListener('click', () => {
      applyState(document.documentElement.dataset.sidebarCollapsed === 'true' ? 'expanded' : 'collapsed');
    });
  });
}

function initMobileDrawer(): void {
  const drawer = document.querySelector<HTMLElement>('[data-drawer]');
  if (!drawer) return;

  const backdrop = drawer.querySelector<HTMLElement>('[data-drawer-backdrop]');
  const panel = drawer.querySelector<HTMLElement>('[data-drawer-panel]');
  let previousFocus: HTMLElement | null = null;
  const setDrawerState = (state: 'open' | 'closed'): void => {
    const isOpen = state === 'open';
    drawer.dataset.open = String(isOpen);
    drawer.setAttribute('aria-hidden', String(!isOpen));
    drawer.classList.toggle('hidden', !isOpen);
    backdrop?.classList.toggle('opacity-0', !isOpen);
    backdrop?.classList.toggle('opacity-100', isOpen);
    panel?.classList.toggle('-translate-x-full', !isOpen);
    panel?.classList.toggle('translate-x-0', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
    if (!isOpen) { previousFocus?.focus(); return; }
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (isMotionEnabled() && panel) {
      animate(panel, { x: [-DRAWER_OFFSET_PX, 0], opacity: [0.85, 1] }, { duration: DRAWER_DURATION_S, ease: EASE_OUT });
    }
    drawer.querySelector<HTMLElement>('button, a, input, [tabindex]:not([tabindex="-1"])')?.focus();
  };

  document.querySelectorAll('[data-drawer-open]').forEach((btn) => btn.addEventListener('click', () => setDrawerState('open')));
  document.querySelectorAll('[data-drawer-close], [data-drawer-backdrop]').forEach((el) => el.addEventListener('click', () => setDrawerState('closed')));
  drawer.addEventListener('click', (event) => { if (event.target === drawer) setDrawerState('closed'); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && drawer.dataset.open === 'true') setDrawerState('closed'); });
}

function resolveTabTarget(trigger: Element): string | null {
  const strataTarget = trigger.getAttribute('data-strata-tab');
  if (strataTarget) return strataTarget.startsWith('#') ? strataTarget : `#${strataTarget}`;
  const bsTarget = trigger.getAttribute('data-bs-target') || trigger.getAttribute('href');
  return bsTarget && bsTarget.startsWith('#') && bsTarget.length > 1 ? bsTarget : null;
}

function activateTabTrigger(trigger: Element): void {
  const targetSelector = resolveTabTarget(trigger);
  const panel = targetSelector ? document.querySelector<HTMLElement>(targetSelector) : null;
  if (!targetSelector || !panel) return;

  const group = trigger.closest('[role="tablist"], [data-tab-list]') ?? document;
  group.querySelectorAll('[data-strata-tab], [data-bs-toggle="tab"], [data-bs-toggle="pill"]').forEach((item) => {
    const active = item === trigger;
    item.setAttribute('aria-selected', String(active));
    item.classList.toggle('active', active);
    item.classList.toggle('is-active', active);
  });

  Array.from(panel.parentElement?.children ?? []).forEach((sibling) => {
    if (!(sibling instanceof HTMLElement) || sibling === panel) return;
    sibling.classList.remove('active', 'show', 'is-active');
    sibling.setAttribute('hidden', '');
  });
  panel.removeAttribute('hidden');
  panel.classList.add('active', 'show', 'is-active');
  if (window.location.hash !== targetSelector) {
    history.replaceState({}, '', `${window.location.pathname}${window.location.search}${targetSelector}`);
  }
  updateNavIndicators();
}

function initTabs(): void {
  const triggers = document.querySelectorAll('[data-strata-tab], [data-bs-toggle="tab"], [data-bs-toggle="pill"]');
  if (triggers.length === 0) return;
  const syncFromHash = (): void => {
    const match = window.location.hash ? Array.from(triggers).find((el) => resolveTabTarget(el) === window.location.hash) : undefined;
    if (match) activateTabTrigger(match);
  };
  triggers.forEach((trigger) => trigger.addEventListener('click', (event) => {
    if (!resolveTabTarget(trigger)) return;
    event.preventDefault();
    activateTabTrigger(trigger);
  }));
  syncFromHash();
  window.addEventListener('hashchange', syncFromHash);
}

export function initMotion(): void {
  initAnimateElements();
  initStaggerContainers();
  initCountUpElements();
  initTabs();
  updateNavIndicators();
  initSidebarToggle();
  initMobileDrawer();
  window.addEventListener('resize', updateNavIndicators);
}
