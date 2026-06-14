<script lang="ts">
  // First Svelte component (pilot). Replaces the static titlebar markup in
  // index.html + ui/titlebar.js. Renders the custom window titlebar and wires
  // the minimize/close controls to the Tauri window/app commands.
  import { getTauriAppWindow, getTauriInvoke } from '../core/tauri.js';

  function minimize() {
    const appWindow = getTauriAppWindow();
    if (!appWindow) return;
    // The .minimizing animation visually shows the window heading to the tray.
    const app = document.querySelector('.app');
    app?.classList.add('minimizing');
    setTimeout(async () => {
      await appWindow.hide();
      app?.classList.remove('minimizing');
    }, 450); // a touch shorter than the 500ms animation
  }

  async function close() {
    const invoke = getTauriInvoke();
    if (invoke) await invoke('quit_app');
  }
</script>

<div class="titlebar" data-tauri-drag-region>
  <span class="title">DisplaySong</span>
  <div class="tb-controls">
    <button class="tb-btn" title="Minimieren" on:click={minimize}>─</button>
    <button class="tb-btn tb-close" title="Schließen" on:click={close}>✕</button>
  </div>
</div>
