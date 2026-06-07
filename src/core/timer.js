/**
 * Central Timer System
 * Konsolidiert alle 1-Sekunden-Intervalle in einen einzigen Timer
 * Spart CPU durch weniger Timer-Callbacks
 */

class CentralTimer {
  constructor() {
    this.callbacks = new Map();
    this.interval = null;
    this.lastTick = Date.now();
    this.idCounter = 0;
  }

  /**
   * Startet den zentralen Timer (falls noch nicht läuft)
   */
  start() {
    if (this.interval) return;
    
    this.lastTick = Date.now();
    // Use 100ms interval for smooth progress bar animation
    this.interval = setInterval(() => {
      const now = Date.now();
      const delta = now - this.lastTick;
      this.lastTick = now;
      
      // Alle registrierten Callbacks aufrufen
      this.callbacks.forEach((callback, id) => {
        try {
          callback(now, delta);
        } catch (e) {
          console.error(`Timer callback ${id} error:`, e);
        }
      });
    }, 100);
  }

  /**
   * Stoppt den zentralen Timer
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Registriert einen Callback
   * @param {Function} callback - Funktion die jede Sekunde aufgerufen wird (now, delta)
   * @param {string} [name] - Optionaler Name für Debugging
   * @returns {number} ID zum Deregistrieren
   */
  subscribe(callback, name = null) {
    const id = ++this.idCounter;
    this.callbacks.set(id, callback);
    
    // Timer starten wenn erster Callback
    if (this.callbacks.size === 1) {
      this.start();
    }
    
    if (name) {
      //console.log(`⏱️ Timer subscribed: ${name} (id: ${id})`);
    }
    
    return id;
  }

  /**
   * Entfernt einen Callback
   * @param {number} id - ID vom subscribe()
   */
  unsubscribe(id) {
    this.callbacks.delete(id);
    
    // Timer stoppen wenn keine Callbacks mehr
    if (this.callbacks.size === 0) {
      this.stop();
    }
  }

  /**
   * Entfernt alle Callbacks
   */
  clear() {
    this.callbacks.clear();
    this.stop();
  }

  /**
   * Gibt die Anzahl aktiver Callbacks zurück
   */
  get activeCount() {
    return this.callbacks.size;
  }

  /**
   * Prüft ob der Timer läuft
   */
  get isRunning() {
    return this.interval !== null;
  }
}

// Singleton-Instanz exportieren
export const timer = new CentralTimer();

// Für Debugging im DevTools
if (typeof window !== 'undefined') {
  window.__centralTimer = timer;
}
