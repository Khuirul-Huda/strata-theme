import { animate } from 'motion';
import { isMotionEnabled } from './motion.ts';

export type MessageType = 'info' | 'success' | 'warning' | 'error' | 'danger';

export interface ConfirmModalOptions {
  type: 'small-confirm' | 'confirm' | 'danger';
  title?: string;
  content?: string;
  confirmButton?: string;
  confirmButtonColor?: string;
  confirmCallback?: () => void;
}

export interface PromptModalOptions {
  type: 'prompt';
  title?: string;
  label?: string;
  value?: string;
  promptConfirmCallback?: (value: string) => void;
}

export type ModalOptions = ConfirmModalOptions | PromptModalOptions;
export interface FlashMessageOptions { message?: string; reload?: boolean | string; type?: MessageType; }

const TOAST_DISMISS_MS = 4500;
const FLASH_STORAGE_KEY = 'flash-message';
const DIALOG_ID = 'strata-confirm-modal';
const MOTION_DURATION_S = 0.2;
const CLOSE_DURATION_S = 0.14;
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

const TOAST_STYLE_MAP: Record<MessageType, { icon: string; accent: string; live: 'polite' | 'assertive' }> = {
  info: { icon: 'info', accent: 'text-strata-info', live: 'polite' },
  success: { icon: 'check-circle', accent: 'text-strata-success', live: 'polite' },
  warning: { icon: 'warning', accent: 'text-strata-warning', live: 'polite' },
  error: { icon: 'x-circle', accent: 'text-strata-danger', live: 'assertive' },
  danger: { icon: 'x-circle', accent: 'text-strata-danger', live: 'assertive' },
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createSvgIcon(iconId: string, className: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${iconId}`);
  svg.appendChild(use);
  return svg;
}

function createCloseButton(className: string): HTMLButtonElement {
  const btn = el('button', className);
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Close');
  btn.appendChild(createSvgIcon('x', 'size-4'));
  return btn;
}

function getOrCreateToastContainer(): HTMLElement {
  const existing = document.querySelector<HTMLElement>('.toast-container');
  if (existing) return existing;
  const container = el('div', 'toast-container fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2rem)] pointer-events-none');
  document.body.appendChild(container);
  return container;
}

function dismissToast(toast: HTMLElement): void {
  if (toast.dataset.closing === 'true') return;
  toast.dataset.closing = 'true';
  if (!isMotionEnabled()) {
    toast.remove();
    return;
  }
  animate(toast, { opacity: [1, 0], y: [0, 8], scale: [1, 0.96] }, { duration: MOTION_DURATION_S, ease: EASE_OUT })
    .then(() => toast.remove());
}

export function showMessage(text: string, type: MessageType = 'info'): void {
  const container = getOrCreateToastContainer();
  const meta = TOAST_STYLE_MAP[type] ?? TOAST_STYLE_MAP.info;
  const toast = el('div', 'strata-toast pointer-events-auto flex items-start gap-3 rounded-xl border border-strata-line bg-strata-overlay p-3.5 text-sm text-strata-default shadow-lg');
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', meta.live);
  toast.setAttribute('aria-atomic', 'true');

  const iconWrap = el('span', `mt-0.5 shrink-0 ${meta.accent}`);
  iconWrap.appendChild(createSvgIcon(meta.icon, 'size-5'));
  const body = el('div', 'flex-1 min-w-0 leading-snug break-words', text);
  const closeBtn = createCloseButton('shrink-0 rounded-md p-1 text-strata-subtle hover:bg-strata-fill-hover hover:text-strata-strong focus-visible:outline-2 focus-visible:outline-strata-focus');

  toast.append(iconWrap, body, closeBtn);
  container.appendChild(toast);

  const timer = window.setTimeout(() => dismissToast(toast), TOAST_DISMISS_MS);
  closeBtn.addEventListener('click', () => { window.clearTimeout(timer); dismissToast(toast); });
  if (isMotionEnabled()) {
    animate(toast, { opacity: [0, 1], y: [12, 0], scale: [0.96, 1] }, { duration: MOTION_DURATION_S, ease: EASE_OUT });
  }
}

function getOrCreateDialog(): HTMLDialogElement {
  const existing = document.getElementById(DIALOG_ID);
  if (existing instanceof HTMLDialogElement) return existing;
  const dialog = el('dialog', 'm-auto w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-strata-line bg-strata-overlay p-0 text-strata-default shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-xs');
  dialog.id = DIALOG_ID;
  document.body.appendChild(dialog);
  return dialog;
}

function closeDialogAnimated(dialog: HTMLDialogElement, previousFocus: HTMLElement | null): void {
  const finish = (): void => { if (dialog.open) dialog.close(); previousFocus?.focus(); };
  if (!isMotionEnabled()) { finish(); return; }
  animate(dialog, { opacity: [1, 0], scale: [1, 0.96] }, { duration: CLOSE_DURATION_S, ease: EASE_OUT }).then(finish);
}

export function createModal(options: ModalOptions): void {
  const dialog = getOrCreateDialog();
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const form = el('form', 'flex flex-col gap-4 p-6');
  form.method = 'dialog';

  const header = el('div', 'flex items-start justify-between gap-3');
  header.appendChild(el('h3', 'text-base font-semibold text-strata-strong', options.title || (options.type === 'prompt' ? 'Input required' : 'Confirm action')));
  const closeX = createCloseButton('rounded-lg p-1 text-strata-subtle hover:bg-strata-fill-hover hover:text-strata-strong');
  header.appendChild(closeX);
  form.appendChild(header);

  let promptInput: HTMLInputElement | null = null;
  if (options.type === 'prompt') {
    const fieldWrap = el('label', 'flex flex-col gap-1.5 text-sm text-strata-default');
    fieldWrap.appendChild(el('span', 'font-medium text-strata-strong', options.label ?? 'Value'));
    promptInput = el('input', 'w-full rounded-lg border border-strata-line bg-strata-control px-3 py-2 text-sm text-strata-default focus:outline-2 focus:outline-strata-focus');
    promptInput.type = 'text';
    promptInput.value = options.value ?? '';
    fieldWrap.appendChild(promptInput);
    form.appendChild(fieldWrap);
  } else if (options.content) {
    form.appendChild(el('p', 'text-sm text-strata-subtle leading-relaxed', options.content));
  }

  const actions = el('div', 'flex items-center justify-end gap-2.5 pt-2');
  const cancelBtn = el('button', 'rounded-lg border border-strata-line bg-strata-fill px-3.5 py-2 text-sm font-medium text-strata-strong hover:bg-strata-fill-hover', 'Cancel');
  cancelBtn.type = 'button';

  const isDanger = options.type === 'danger' || (options.type !== 'prompt' && options.confirmButtonColor === 'danger');
  const confirmCls = isDanger
    ? 'rounded-lg bg-strata-danger px-3.5 py-2 text-sm font-medium text-white hover:opacity-90'
    : 'rounded-lg bg-strata-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-strata-brand-hover';
  const confirmBtn = el('button', confirmCls, options.type === 'prompt' ? 'Confirm' : (options.confirmButton || 'Confirm'));
  confirmBtn.type = 'submit';

  actions.append(cancelBtn, confirmBtn);
  form.appendChild(actions);
  dialog.replaceChildren(form);

  const handleClose = (): void => closeDialogAnimated(dialog, previousFocus);
  cancelBtn.addEventListener('click', handleClose);
  closeX.addEventListener('click', handleClose);
  dialog.oncancel = (event) => { event.preventDefault(); handleClose(); };
  dialog.onclick = (event) => { if (event.target === dialog) handleClose(); };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handleClose();
    if (options.type === 'prompt') options.promptConfirmCallback?.(promptInput?.value ?? '');
    else options.confirmCallback?.();
  });

  dialog.showModal();
  if (isMotionEnabled()) animate(dialog, { opacity: [0, 1], scale: [0.95, 1] }, { duration: MOTION_DURATION_S, ease: EASE_OUT });
  (promptInput ?? confirmBtn).focus();
}

export function flashMessage(options: FlashMessageOptions = {}): void {
  const { message = '', reload = false, type = 'info' } = options;
  let sessionMessage: string | null = null;
  try { sessionMessage = sessionStorage.getItem(FLASH_STORAGE_KEY); } catch { return; }

  if (message === '' && sessionMessage) {
    showMessage(sessionMessage, type);
    try { sessionStorage.removeItem(FLASH_STORAGE_KEY); } catch { /* ignore */ }
    return;
  }
  if (!message) return;

  try { sessionStorage.setItem(FLASH_STORAGE_KEY, message); } catch { /* ignore */ }
  if (reload === true) window.location.reload();
  else if (typeof reload === 'string') window.location.assign(reload);
}

export function registerGlobalDialogs(): void {
  window.FOSSBilling = Object.assign(window.FOSSBilling || {}, { message: showMessage });
  window.Modals = { create: createModal };
  globalThis.flashMessage = flashMessage;
}

declare global {
  interface Window {
    FOSSBilling?: Record<string, unknown> & {
      message?: (message: string, type?: MessageType) => void;
      cookieNames?: { locale?: string; timezone?: string };
      cookieRead?: (name: string) => string | null;
      cookieCreate?: (name: string, value: string, days?: number) => void;
      api?: { guest?: { post: (url: string, params?: Record<string, unknown>, onOk?: (res: unknown) => void, onErr?: (err: unknown) => void) => void } };
    };
    Modals?: { create: (options: ModalOptions) => void };
  }
  // eslint-disable-next-line no-var
  var flashMessage: ((options?: FlashMessageOptions) => void) | undefined;
}
