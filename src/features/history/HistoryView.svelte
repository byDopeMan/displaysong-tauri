<!--
  History view shell (markup only). The "Blockiert" button + the #history-simple
  list mount are wired/mounted by the history module by id after this mounts.
-->
<div class="history-header">
  <div>
    <h2 data-i18n="history.title">Song-Verlauf</h2>
    <p class="history-subtitle" data-i18n="history.subtitle">Zuletzt gespielte Songs</p>
  </div>
  <button id="btn-open-blocklist" class="btn-icon-sm" title="Blockierte Songs verwalten">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
    <span>Blockiert</span>
  </button>
</div>

<!-- Simple List with Platform Links -->
<div id="history-simple" class="history-list">
  <div class="history-empty">
    <svg class="empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M9 18V5l12-2v13"></path>
      <circle cx="6" cy="18" r="3"></circle>
      <circle cx="18" cy="16" r="3"></circle>
    </svg>
    <p data-i18n="history.empty">Noch keine Songs gespielt</p>
  </div>
</div>
