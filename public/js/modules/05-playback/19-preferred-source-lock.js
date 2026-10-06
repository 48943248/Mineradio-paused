// ============================================================
// Preferred playback source lock
//
// Once the user manually switches the current track to a source,
// remember that provider in localStorage and use it for subsequent
// tracks. The preference survives page reloads.
// ============================================================
(function installPreferredPlaybackSourceLock() {
  'use strict';

  var STORAGE_KEY = 'mineradio-preferred-playback-provider';
  var VALID_PROVIDERS = ['netease', 'qq', 'kugou', 'qishui', 'spotify'];

  function normalizeProvider(provider) {
    provider = String(provider || '').trim().toLowerCase();
    return VALID_PROVIDERS.indexOf(provider) >= 0 ? provider : '';
  }

  function getPreferredProvider() {
    try {
      return normalizeProvider(localStorage.getItem(STORAGE_KEY) || '');
    } catch (e) {
      return '';
    }
  }

  function setPreferredProvider(provider) {
    provider = normalizeProvider(provider);
    if (!provider) return;
    try {
      localStorage.setItem(STORAGE_KEY, provider);
    } catch (e) {}
  }

  function isExcludedSong(song) {
    if (!song) return true;
    if (song.isLocal || song.localFile || song.localPath || song.filePath || song.localUrl) return true;
    var type = String(song.type || '').toLowerCase();
    return type === 'local' || type === 'podcast' || type === 'program';
  }

  function getSongProvider(song) {
    if (typeof window.songProviderKey === 'function') {
      return normalizeProvider(window.songProviderKey(song));
    }
    if (song && (song.provider === 'qq' || song.source === 'qq' || song.type === 'qq')) return 'qq';
    if (song && (song.provider === 'kugou' || song.source === 'kugou' || song.type === 'kugou' || song.hash || song.audioHash)) return 'kugou';
    if (song && (song.provider === 'qishui' || song.source === 'qishui' || song.type === 'qishui')) return 'qishui';
    if (song && (song.provider === 'spotify' || song.source === 'spotify' || song.type === 'spotify' || song.spotifyId || song.spotifyUri)) return 'spotify';
    return 'netease';
  }

  window.getPreferredPlaybackProvider = getPreferredProvider;
  window.setPreferredPlaybackProvider = setPreferredProvider;

  // The source switcher is already implemented by 07-search.js. We only
  // record the provider after that function completes and the current queue
  // entry really has the selected provider. This prevents a failed switch
  // from changing the persistent preference.
  if (typeof window.switchCurrentSongSource === 'function') {
    var originalSwitchCurrentSongSource = window.switchCurrentSongSource;
    window.switchCurrentSongSource = async function (provider) {
      provider = normalizeProvider(provider);
      var result = await originalSwitchCurrentSongSource.apply(this, arguments);
      if (provider && Array.isArray(window.playQueue) && typeof window.currentIdx !== 'undefined') {
        var current = window.playQueue[window.currentIdx];
        if (current && getSongProvider(current) === provider && !isExcludedSong(current)) {
          setPreferredProvider(provider);
        }
      }
      return result;
    };
  }

  if (typeof window.playQueueAt !== 'function' || typeof window.findControlSourceMatchResult !== 'function') {
    console.warn('[PreferredSource] playback/source-switch functions are not ready');
    return;
  }

  var originalPlayQueueAt = window.playQueueAt;
  var matchSerial = 0;

  window.playQueueAt = async function (idx, opts) {
    opts = opts || {};

    // Manual source-switch playback has already selected its source. Calls
    // explicitly marked as processed must also pass through untouched.
    if (!opts.sourceSwitch && !opts.preferredSourceApplied && !opts.skipPreferredSource) {
      var preferred = getPreferredProvider();
      var queue = Array.isArray(window.playQueue) ? window.playQueue : [];
      var song = idx >= 0 && idx < queue.length ? queue[idx] : null;

      if (preferred && song && !isExcludedSong(song)) {
        var currentProvider = getSongProvider(song);

        if (currentProvider !== preferred) {
          var serial = ++matchSerial;
          try {
            var result = await window.findControlSourceMatchResult(song, preferred);
            if (serial === matchSerial) {
              var matched = result && result.song ? result.song : null;
              if (matched) {
                matched.preferredPlaybackProvider = preferred;
                matched.preferredPlaybackAppliedAt = Date.now();
                if (typeof window.hydrateCustomCover === 'function') {
                  matched = window.hydrateCustomCover(matched);
                }
                if (Array.isArray(window.playQueue) && idx >= 0 && idx < window.playQueue.length) {
                  window.playQueue[idx] = matched;
                  opts.preferredSourceApplied = true;
                }
              }
            }
          } catch (err) {
            // Keep the original queue entry so the existing provider fallback
            // logic can handle failures exactly as before.
            console.warn('[PreferredSource] match failed:', preferred, err);
          }
        }
      }
    }

    return originalPlayQueueAt.call(this, idx, opts);
  };

  console.info('[PreferredSource] installed; current preference:', getPreferredProvider() || 'none');
})();
