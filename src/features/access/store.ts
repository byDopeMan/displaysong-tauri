/**
 * Visibility of the access-request modal (the secret "420" developer-access flow).
 * Opened by the 420 key sequence handlers; rendered by AccessRequestModal.svelte.
 */

import { writable } from 'svelte/store';

export const accessModalOpen = writable(false);
