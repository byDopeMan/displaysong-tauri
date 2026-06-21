<!--
  Standalone Queue view shell (shown when the Player tab is disabled). Markup
  only — the queue module wires the autoplay toggle / clear button / count and
  mounts Queue.svelte into #queue-list-standalone by id after this mounts.
-->
<div class="queue-container">
  <div class="queue-header">
    <h2 class="queue-title">
      <span class="queue-title-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
      </span>
      <span data-i18n="queue.title">Song Request Queue</span>
      <span class="queue-count-standalone" id="queue-count-standalone">0</span>
    </h2>
    <div class="queue-header-actions">
      <span class="queue-autoplay-label" data-i18n="queue.autoplay">Auto-Play</span>
      <label class="toggle-switch" title="An: spielt die Queue automatisch der Reihe nach ab. Aus: deine normale Wiedergabe läuft weiter.">
        <input type="checkbox" class="js-queue-autoplay">
        <span class="toggle-slider"></span>
      </label>
      <button id="btn-clear-queue-standalone" class="btn btn-danger btn-small" data-i18n="queue.clear">Queue leeren</button>
    </div>
  </div>
  <div id="queue-list-standalone"></div>
</div>
