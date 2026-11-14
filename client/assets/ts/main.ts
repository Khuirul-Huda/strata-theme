import { initMotion } from './motion.ts';
import {
  initCurrencySelectors,
  initDropdowns,
  initLanguageSelector,
  initLocaleDropdown,
  initPhoneInput,
  initRequiredAsterisks,
  initTooltips,
} from './selectors.ts';
import { initThemeMode } from './theme-mode.ts';
import { flashMessage, registerGlobalDialogs } from './ui-dialogs.ts';

// Expose FOSSBilling.message, window.Modals, and globalThis.flashMessage synchronously
// so inline scripts (e.g. partial_pending_messages.html.twig) and core api.js always find them.
registerGlobalDialogs();

function bootstrapStrataClient(): void {
  initThemeMode();
  initMotion();
  initDropdowns();
  initLocaleDropdown();
  initCurrencySelectors();
  initRequiredAsterisks();
  initPhoneInput();
  initTooltips();
  void initLanguageSelector();
  flashMessage({});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapStrataClient);
} else {
  bootstrapStrataClient();
}
