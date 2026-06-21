<!--
  Floating controls for a playing YouTube request. Markup only — the queue
  YouTube player wires the pause/skip buttons, the volume select and the
  #youtube-controls visibility by id after this mounts.
-->
<div id="youtube-controls" class="youtube-controls hidden">
  <select id="yt-volume-select" class="yt-volume-select" title="YouTube-Lautstärke (Anteil der Spotify-Lautstärke)">
    <option value="1">YT 100%</option>
    <option value="0.9">YT 90%</option>
    <option value="0.8">YT 80%</option>
    <option value="0.7">YT 70%</option>
    <option value="0.6">YT 60%</option>
    <option value="0.5">YT 50%</option>
    <option value="0.4">YT 40%</option>
    <option value="0.3">YT 30%</option>
    <option value="0.2">YT 20%</option>
    <option value="0.1">YT 10%</option>
  </select>
  <button id="btn-youtube-pause" class="yt-control-btn" data-state="playing" title="Pausieren">
    <svg class="yt-icon-pause" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>
    <svg class="yt-icon-play" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
  </button>
  <button id="btn-youtube-skip" class="yt-control-btn" title="Überspringen">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5l11 7-11 7V5zm12 0h2v14h-2z"></path></svg>
  </button>
</div>
