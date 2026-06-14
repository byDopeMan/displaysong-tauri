/**
 * i18n - Internationalization System
 */

type Translations = Record<string, unknown>;

let currentLanguage = 'de';
let translations: Translations = {};

/**
 * Load language file
 */
export async function loadLanguage(lang: string): Promise<void> {
  try {
    // Try standard languages first
    const response = await fetch(`./locales/${lang}.json`);
    if (response.ok) {
      translations = await response.json();
      currentLanguage = lang;
      return;
    }

    // Try custom language from AppData
    if (window.__TAURI__?.tauri) {
      const customLang = await window.__TAURI__.tauri.invoke('load_custom_language', { code: lang });
      translations = JSON.parse(customLang);
      currentLanguage = lang;
    }
  } catch (e) {
    console.error('Failed to load language:', e);
    // Fallback to German
    if (lang !== 'de') {
      await loadLanguage('de');
    }
  }
}

interface CustomLanguage {
  code: string;
  name: string;
  author: string;
}

/**
 * Get available custom languages from AppData
 */
export async function getCustomLanguages(): Promise<CustomLanguage[]> {
  if (!window.__TAURI__?.tauri) return [];

  try {
    return await window.__TAURI__.tauri.invoke('get_custom_languages');
  } catch (e) {
    console.error('Failed to get custom languages:', e);
    return [];
  }
}

/**
 * Populate language select with available languages
 */
export async function populateLanguageSelect(): Promise<void> {
  const select = document.getElementById('language-select') as HTMLSelectElement | null;
  if (!select) return;

  // Get custom languages
  const customLangs = await getCustomLanguages();

  // Add custom languages to select
  for (const lang of customLangs) {
    // Check if not already in select
    if (![...select.options].some((opt) => opt.value === lang.code)) {
      const option = document.createElement('option');
      option.value = lang.code;
      option.textContent = `${lang.name} (${lang.author})`;
      select.appendChild(option);
    }
  }

  // Set current language
  select.value = currentLanguage;
}

/**
 * Translate a key with optional parameter replacement
 */
export function t(
  key: string,
  params: Record<string, string | number> = {},
  defaultValue: string = key,
): string {
  const keys = key.split('.');
  let value: unknown = translations;

  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = (value as Record<string, unknown>)[k];
    } else {
      return defaultValue;
    }
  }

  if (!value || value === key || typeof value !== 'string') return defaultValue;

  // Replace parameters like {name}, {n}, etc.
  let result = value;
  for (const [param, val] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${param}\\}`, 'g'), String(val));
  }

  return result;
}

/**
 * Update all elements with data-i18n attribute
 */
export function updatePageTranslations(): void {
  // Regular text content
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const translated = t(key);

    // Skip if translation not found (keep original)
    if (translated === key) return;

    // Handle different element types
    if (el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'password' || el.type === 'email')) {
      el.placeholder = translated;
    } else {
      el.textContent = translated;
    }
  });

  // Title attributes
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (!key) return;
    const translated = t(key);
    if (translated !== key) {
      (el as HTMLElement).title = translated;
    }
  });

  // Placeholder attributes
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) return;
    const translated = t(key);
    if (translated !== key && el instanceof HTMLInputElement) {
      el.placeholder = translated;
    }
  });
}

/**
 * Get current language
 */
export function getCurrentLanguage(): string {
  return currentLanguage;
}

/**
 * Get translations object for external use
 */
export function getTranslations(): Translations {
  return translations;
}
