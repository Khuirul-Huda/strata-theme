import intlTelInput, { type Iso2 } from 'intl-tel-input';
import { showMessage } from './ui-dialogs.ts';

const LOCALE_COOKIE_DAYS = 365;
const DEFAULT_LOCALE_COOKIE = 'fossbilling_locale';
const TOOLTIP_GAP_PX = 8;

function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error) return error;
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; code?: unknown };
    if (typeof record.message === 'string' && record.message) return record.message;
    if (typeof record.code === 'string' && record.code) return record.code;
  }
  return 'An unexpected error occurred';
}

export function initCurrencySelectors(): void {
  document.querySelectorAll<HTMLSelectElement>('select.currency_selector').forEach((select) => {
    if (select.dataset.currencyBound === 'true') return;
    select.dataset.currencyBound = 'true';

    select.addEventListener('change', () => {
      const post = window.FOSSBilling?.api?.guest?.post;
      if (typeof post !== 'function') return;
      post(
        'cart/set_currency',
        { currency: select.value },
        () => window.location.reload(),
        (error) => showMessage(extractErrorMessage(error), 'error'),
      );
    });
  });
}

function findLabelForInput(input: Element): HTMLLabelElement | null {
  if (input.previousElementSibling instanceof HTMLLabelElement) return input.previousElementSibling;
  const id = input.getAttribute('id');
  if (id) {
    const explicit = (input.closest('form') ?? document).querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
    if (explicit) return explicit;
  }
  return input.closest('label');
}

export function initRequiredAsterisks(): void {
  document.querySelectorAll('input[required], textarea[required]').forEach((input) => {
    if (input.closest('.auth')) return;
    const label = findLabelForInput(input);
    if (!label || label.querySelector('[data-required-mark]')) return;

    const asterisk = document.createElement('span');
    asterisk.dataset.requiredMark = 'true';
    asterisk.textContent = ' *';
    asterisk.className = 'text-strata-danger';
    asterisk.setAttribute('aria-hidden', 'true');
    label.appendChild(asterisk);
  });
}

export function initPhoneInput(): void {
  const inputs = document.querySelectorAll<HTMLInputElement>('.js-phone-input');
  if (inputs.length === 0) return;

  const countries = intlTelInput.getAllCountries();
  const supported = new Set(countries.map((country) => country.iso2));
  const isSupportedCountry = (country: string): country is Iso2 => supported.has(country as Iso2);

  inputs.forEach((input) => {
    const form = input.closest('form') || document;
    const countryCodeInput = form.querySelector<HTMLInputElement>('input[name="phone_cc"], input[name$="[phone_cc]"]');
    if (!countryCodeInput) return;

    const initialCc = countryCodeInput.value.trim();
    const countrySelect = form.querySelector<HTMLSelectElement>('select[name="country"], select[name$="[country]"]');
    const selectedCountry = (countrySelect?.value || input.dataset.initialCountry || '').toLowerCase();
    const initialCountry = countries.find((c) => c.dialCode === initialCc)?.iso2
      || (isSupportedCountry(selectedCountry) ? selectedCountry : '');

    const iti = intlTelInput(input, {
      initialCountry,
      separateDialCode: true,
      loadUtils: () => import('intl-tel-input/utils'),
    });

    const syncFields = (): void => {
      const dialCode = iti.getSelectedCountry()?.dialCode || countryCodeInput.value;
      countryCodeInput.value = (input.value.trim() || initialCc) ? dialCode : '';
      if (input.value.trim().startsWith('+') && dialCode) {
        const international = iti.getNumber();
        if (international.startsWith(`+${dialCode}`)) {
          input.value = international.replace(`+${dialCode}`, '').trim();
        }
      }
    };

    countrySelect?.addEventListener('change', () => {
      const country = countrySelect.value.toLowerCase();
      if (isSupportedCountry(country)) {
        iti.setSelectedCountry(country);
        syncFields();
      }
    });

    input.addEventListener('countrychange', syncFields);
    input.addEventListener('input', syncFields);
    input.form?.addEventListener('submit', syncFields, true);
    syncFields();
  });
}

function extractFlagClass(customProperties: unknown): string {
  if (typeof customProperties !== 'string' || !customProperties) return '';
  const match = customProperties.match(/class="([^"]*fi[^"]*)"/);
  return match ? match[1] : '';
}

export async function initLanguageSelector(): Promise<void> {
  const localeSelectorEl = document.querySelector<HTMLSelectElement>('.js-locale-selector');
  if (!localeSelectorEl) return;

  try {
    const { default: TomSelect } = await import('tom-select');
    const fb = window.FOSSBilling;
    const localeCookie = fb?.cookieNames?.locale || DEFAULT_LOCALE_COOKIE;
    const selectedLang = fb?.cookieRead?.(localeCookie) || localeSelectorEl.value;

    const renderTemplate = (data: Record<string, unknown>, escape: (str: string) => string): string => {
      const flagClass = extractFlagClass(data.customProperties);
      const flagHtml = flagClass ? `<span class="${flagClass} shrink-0"></span>` : '';
      return `<div class="flex items-center gap-2">${flagHtml}<span>${escape(String(data.text ?? ''))}</span></div>`;
    };

    new TomSelect(localeSelectorEl, {
      copyClassesToDropdown: false,
      controlClass: 'ts-control locale',
      dropdownClass: 'ts-dropdown locale-selector-dropdown',
      optionClass: 'option',
      controlInput: null,
      items: selectedLang ? [selectedLang] : [],
      render: { item: renderTemplate, option: renderTemplate },
      onItemAdd: (value: string | number) => {
        fb?.cookieCreate?.(localeCookie, String(value), LOCALE_COOKIE_DAYS);
        window.location.reload();
      },
    });
  } catch (error) {
    console.error('Failed to initialize language selector:', error);
  }
}

export function initTooltips(): void {
  const triggers = document.querySelectorAll<HTMLElement>('[data-bs-toggle="tooltip"], [data-tooltip]');
  if (triggers.length === 0) return;

  const tooltipEl = document.createElement('div');
  tooltipEl.id = 'strata-tooltip';
  tooltipEl.setAttribute('role', 'tooltip');
  tooltipEl.className = 'fixed z-50 hidden pointer-events-none rounded-md bg-strata-contrast px-2.5 py-1 text-xs font-medium text-strata-inverse shadow-md max-w-xs';
  document.body.appendChild(tooltipEl);

  const hide = (): void => tooltipEl.classList.add('hidden');
  const show = (trigger: HTMLElement, text: string): void => {
    tooltipEl.textContent = text;
    tooltipEl.classList.remove('hidden');
    const rect = trigger.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();
    const topAbove = rect.top - tipRect.height - TOOLTIP_GAP_PX;
    tooltipEl.style.top = `${topAbove > TOOLTIP_GAP_PX ? topAbove : rect.bottom + TOOLTIP_GAP_PX}px`;
    const rawLeft = rect.left + (rect.width - tipRect.width) / 2;
    tooltipEl.style.left = `${Math.max(TOOLTIP_GAP_PX, Math.min(rawLeft, window.innerWidth - tipRect.width - TOOLTIP_GAP_PX))}px`;
  };

  triggers.forEach((trigger) => {
    const text = trigger.getAttribute('data-tooltip') || trigger.getAttribute('data-bs-title') || trigger.getAttribute('title');
    if (!text) return;
    if (trigger.hasAttribute('title')) {
      if (!trigger.getAttribute('aria-label')) trigger.setAttribute('aria-label', text);
      trigger.removeAttribute('title');
    }
    trigger.setAttribute('aria-describedby', tooltipEl.id);
    trigger.addEventListener('mouseenter', () => show(trigger, text));
    trigger.addEventListener('focus', () => show(trigger, text));
    trigger.addEventListener('mouseleave', hide);
    trigger.addEventListener('blur', hide);
  });

  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hide(); });
}

function setDropdownCookie(locale: string): void {
  const fb = window.FOSSBilling;
  const localeCookie = fb?.cookieNames?.locale || DEFAULT_LOCALE_COOKIE;
  if (typeof fb?.cookieCreate === 'function') {
    fb.cookieCreate(localeCookie, locale, LOCALE_COOKIE_DAYS);
    return;
  }
  const expires = new Date(Date.now() + LOCALE_COOKIE_DAYS * 86400_000).toUTCString();
  document.cookie = `${encodeURIComponent(localeCookie)}=${encodeURIComponent(locale)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function initDropdowns(): void {
  const dropdowns = Array.from(document.querySelectorAll<HTMLDetailsElement>('details[data-dropdown]'));
  if (dropdowns.length === 0) return;

  const closeOthers = (current: HTMLDetailsElement): void => {
    dropdowns.forEach((el) => {
      if (el !== current && el.open) el.open = false;
    });
  };

  dropdowns.forEach((dropdown) => {
    if (dropdown.dataset.dropdownBound === 'true') return;
    dropdown.dataset.dropdownBound = 'true';
    dropdown.addEventListener('toggle', () => {
      if (dropdown.open) closeOthers(dropdown);
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target as Node | null;
    dropdowns.forEach((dropdown) => {
      if (dropdown.open && target && !dropdown.contains(target)) {
        dropdown.open = false;
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    dropdowns.forEach((dropdown) => {
      if (dropdown.open) {
        dropdown.open = false;
        dropdown.querySelector('summary')?.focus();
      }
    });
  });
}

export function initLocaleDropdown(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-locale-option]').forEach((button) => {
    if (button.dataset.localeBound === 'true') return;
    button.dataset.localeBound = 'true';
    button.addEventListener('click', () => {
      const locale = button.dataset.localeOption;
      if (!locale) return;
      const isCurrent = button.getAttribute('aria-checked') === 'true';
      const parentDropdown = button.closest<HTMLDetailsElement>('details[data-dropdown]');
      if (isCurrent) {
        if (parentDropdown) parentDropdown.open = false;
        return;
      }
      setDropdownCookie(locale);
      window.location.reload();
    });
  });
}
