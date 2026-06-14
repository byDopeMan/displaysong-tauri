/**
 * Access API – low-level HTTP helpers for the DisplaySong access service.
 *
 * Leaf module: no dependencies on other access/* modules, so it can be
 * imported anywhere without creating cycles.
 */

export const ACCESS_API_URL = 'https://displaysong-api.bydopeman.workers.dev';

/**
 * Fetch the shared Spotify developer credentials for an approved user.
 * Never throws – returns nulls on any failure so callers can branch safely.
 */
export async function fetchDeveloperCredentials(userEmail) {
  try {
    const res = await fetch(`${ACCESS_API_URL}/get-developer-credentials`, {
      headers: { 'X-User-Email': userEmail }
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Fehler beim Abrufen der Credentials');
    }

    return await res.json();
  } catch (e) {
    console.warn('Developer Credentials nicht verfügbar:', e);
    return { clientId: null, clientSecret: null };
  }
}
