// ============================================================
// Preferred playback source lock
// A manual source switch becomes the preferred source for later tracks.
// The preference is local to this browser and survives reloads.
// ============================================================
(function installPreferredPlaybackSourceLock() {
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

  // Expose the helpers so the rest of the playback code can inspect/update
  // the preference without introducing another global storage convention.
  window.getPreferredPlaybackProvider = getPreferredProvider;
  window.setPreferredPlaybackProvider = setPreferredProvider;

  // Keep the existing manual source switch implementation intact, but record
  // the provider the user explicitly chose before it starts playback.
  if (typeof window.switchCurrentSongSource === 'function') {
    var originalSwitchCurrentSongSource = window.switchCurrentSongSource;
    window.switchCurrentSongSource = async function (provider) {
      provider = normalizeProvider(provider);
      if (provider) setPreferredProvider(provider);
      return originalSwitchCurrentSongSource.apply(this, arguments);
    };
  }

  if (typeof window.playQueueAt !== 'function' || typeof window.findControlSourceMatchResult !== 'function') {
    console.warn('[PreferredSource] playback/source-switch functions are not ready');
    return;
  }

  var originalPlayQueueAt = window.playQueueAt;

  window.playQueueAt = async function (idx, opts) {
    opts = opts || {};

    // Never interfere with explicit source-switch playback or with calls that
    // have already been processed by this layer.
    if (!opts.sourceSwitch && !opts.preferredSourceApplied) {
      var preferred = getPreferredProvider();
      var queue = Array.isArray(window.playQueue) ? window.playQueue : [];
      var song = idx >= 0 && idx < queue.length ? queue[idx] : null;

      if (preferred && song && song.type !== 'local' && song.source !== 'local' && !song.localUrl && song.type !== 'podcast') {
        var currentProvider = typeof window.songProviderKey === 'function'
          ? window.songProviderKey(song)
          : '';

        if (currentProvider !== preferred) {
          try {
            var result = await window.findControlSourceMatchResult(song, preferred);
            var matched = result && result.song ? result.song : null;

            // If the preferred source has a matching track, replace this queue
            // entry with that source. If not, leave it untouched so the
            // project's existing fallback logic can handle it normally.
            if (matched) {
              matched.preferredPlaybackProvider = preferred;
              matched.preferredPlaybackAppliedAt = Date.now();
              if (typeof window.hydrateCustomCover === 'function') {
                matched = window.hydrateCustomCover(matched);
              }
              queue[idx] = matched;
              opts.preferredSourceApplied = true;
            }
          } catch (err) {
            console.warn('[PreferredSource] match failed:', preferred, err);
          }
        }
      }
    }

    return originalPlayQueueAt.call(this, idx, opts);
  };

  console.info('[PreferredSource] installed; current preference:', getPreferredProvider() || 'none');
})();
