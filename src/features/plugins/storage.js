/**
 * Per-plugin localStorage helpers.
 *
 * Each plugin gets its own namespaced bucket under `plugin:<id>`. Leaf module
 * (no other plugins/* imports) so both the API surface and the settings UI can
 * use it without creating a cycle.
 */

function bucket(pluginId) {
  try {
    return JSON.parse(localStorage.getItem(`plugin:${pluginId}`) || '{}');
  } catch {
    return {};
  }
}

export function getLocalSetting(pluginId, key, defaultValue = null) {
  const data = bucket(pluginId);
  return data[key] ?? defaultValue;
}

export function setLocalSetting(pluginId, key, value) {
  try {
    const data = bucket(pluginId);
    data[key] = value;
    localStorage.setItem(`plugin:${pluginId}`, JSON.stringify(data));
  } catch (e) {
    console.error('Plugin setting save failed:', e);
  }
}
