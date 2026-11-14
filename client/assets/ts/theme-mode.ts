import { animate } from 'motion';
import { isMotionEnabled } from './motion.ts';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const ICON_ANIMATION_DURATION_S = 0.22;
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

function isValidTheme(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

function readStoredTheme(): ThemeMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isValidTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* Private browsing or disabled storage */
  }
}

function resolveInitialTheme(): ThemeMode {
  const stored = readStoredTheme();
  if (stored) {
    return stored;
  }

  const root = document.documentElement;
  const domMode = root.getAttribute('data-mode') || root.getAttribute('data-bs-theme');
  if (isValidTheme(domMode)) {
    return domMode;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function themeFromElement(el: Element): ThemeMode | null {
  const explicit = el.getAttribute('data-theme-value');
  if (isValidTheme(explicit)) {
    return explicit;
  }

  const href = el.getAttribute('href');
  if (!href) {
    return null;
  }

  try {
    const candidate = new URL(href, window.location.href).searchParams.get(STORAGE_KEY);
    return isValidTheme(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function syncTogglerStates(activeTheme: ThemeMode): void {
  document.querySelectorAll('.js-theme-toggler').forEach((el) => {
    const targetTheme = themeFromElement(el);
    const pressed = targetTheme ? targetTheme === activeTheme : activeTheme === 'dark';
    el.setAttribute('aria-pressed', String(pressed));
  });
}

function animateThemeIcons(sourceEl: Element): void {
  if (!isMotionEnabled()) {
    return;
  }

  const icons = sourceEl.querySelectorAll('svg');
  const targets = icons.length > 0 ? icons : document.querySelectorAll('.js-theme-toggler svg');
  if (targets.length === 0) {
    return;
  }

  animate(
    targets,
    { scale: [0.8, 1], opacity: [0.5, 1], rotate: [-15, 0] },
    { duration: ICON_ANIMATION_DURATION_S, ease: EASE_OUT },
  );
}

export function applyThemeMode(theme: ThemeMode): void {
  const root = document.documentElement;
  root.setAttribute('data-mode', theme);
  root.setAttribute('data-bs-theme', theme);
  writeStoredTheme(theme);
  syncTogglerStates(theme);
}

export function initThemeMode(): void {
  applyThemeMode(resolveInitialTheme());

  document.querySelectorAll('.js-theme-toggler').forEach((el) => {
    if (el instanceof HTMLElement && el.dataset.themeBound === 'true') {
      return;
    }
    if (el instanceof HTMLElement) {
      el.dataset.themeBound = 'true';
    }

    el.addEventListener('click', (event) => {
      event.preventDefault();
      const current = document.documentElement.getAttribute('data-mode') === 'dark' ? 'dark' : 'light';
      const nextTheme = themeFromElement(el) ?? (current === 'dark' ? 'light' : 'dark');
      applyThemeMode(nextTheme);
      animateThemeIcons(el);
    });
  });
}
