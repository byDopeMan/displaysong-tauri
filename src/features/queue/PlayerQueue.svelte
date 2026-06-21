<!--
  Queue block shown under the player (Player tab). Markup only — the queue module
  toggles visibility / wires the autoplay toggle, clear button and count, and
  mounts Queue.svelte into #queue-list, all by id after this mounts.
-->
<div id="player-queue-container" class="player-queue-container hidden">
  <div class="queue-divider"></div>
  <div class="queue-header">
    <h3 class="queue-title">
      <span class="queue-title-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
      </span>
      <span data-i18n="queue.title">Song Request Queue</span>
      <span class="queue-count" id="queue-count">0</span>
    </h3>
    <div class="queue-header-actions">
      <span class="queue-autoplay-label" data-i18n="queue.autoplay">Auto-Play</span>
      <label class="toggle-switch" title="An: spielt die Queue automatisch der Reihe nach ab. Aus: deine normale Wiedergabe läuft weiter.">
        <input type="checkbox" class="js-queue-autoplay">
        <span class="toggle-slider"></span>
      </label>
      <button id="btn-clear-queue" class="btn btn-danger btn-small" data-i18n="queue.clear">Queue leeren</button>
    </div>
  </div>
  <div id="queue-list"></div>
</div>
