// @ts-nocheck
/* Widget logic for widgets/custom1 loader. Authored as TS; inlined back into the .html at build. */
// Lädt Widget-Content aus AppData
    (async () => {
      try {
        const { invoke } = window.__TAURI__.tauri;
        const content = await invoke('get_custom_widget_content', { name: 'custom1' });
        
        // HTML parsen und einfügen
        document.open();
        document.write(content);
        document.close();
      } catch (e) {
        document.body.innerHTML = '<div style="padding:20px;color:#f66;background:#111;font-family:system-ui;">Fehler: ' + e + '</div>';
      }
    })();
