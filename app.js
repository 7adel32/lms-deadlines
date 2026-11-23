(() => {
  'use strict';

  const AST_TIMEZONE = 'Asia/Riyadh';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;
  const MIN_MS = 60 * 1000;
  const PAST_DUE_WINDOW_MS = 5 * DAY_MS;

  const state = {
    courses: [],
    deadlines: [],
    generatedAt: null,
    selectedCourse: null, // null = All Courses
    showPastDue: true,
    sfxEnabled: false,
    searchQuery: '',
    audioCtx: null,
    toastTimer: null,
  };

  const els = {
    syncStatus: document.getElementById('sync-status'),
    syncText: document.getElementById('sync-text'),
    btnPastDue: document.getElementById('btn-past-due'),
    pastDueBtnCount: document.getElementById('past-due-btn-count'),
    btnSfx: document.getElementById('btn-sfx'),
    btnTheme: document.getElementById('btn-theme'),
    themeIcon: document.getElementById('theme-icon'),
    themeLabel: document.getElementById('theme-label'),
    btnExportAll: document.getElementById('btn-export-all'),
    statUpcoming: document.getElementById('stat-upcoming'),
    statSoon: document.getElementById('stat-soon'),
    statPast: document.getElementById('stat-past'),
    searchInput: document.getElementById('search-input'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    courseRack: document.getElementById('course-rack'),
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    errorMessage: document.getElementById('error-message'),
    btnRetry: document.getElementById('btn-retry'),
    upcomingSection: document.getElementById('upcoming-section'),
    upcomingCountBadge: document.getElementById('upcoming-count-badge'),
    upcomingGrid: document.getElementById('upcoming-grid'),
    pastSection: document.getElementById('past-section'),
    pastCountBadge: document.getElementById('past-count-badge'),
    pastGrid: document.getElementById('past-grid'),
    emptyState: document.getElementById('empty-state'),
    emptyDesc: document.getElementById('empty-desc'),
    btnResetFilters: document.getElementById('btn-reset-filters'),
    footerSyncMeta: document.getElementById('footer-sync-meta'),
    toast: document.getElementById('toast'),
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      els.toast.classList.remove('is-visible');
    }, 2200);
  }

  /* ------------------------------------------------------------------------
     Synthesized Mechanical Keycap Click SFX (Web Audio API, zero assets)
     ------------------------------------------------------------------------ */
  function playKeySound(type = 'down') {
    if (!state.sfxEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!state.audioCtx) {
        state.audioCtx = new AudioCtx();
      }
      if (state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
      }
      const ctx = state.audioCtx;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const startFreq = type === 'down' ? 190 : 260;
      const endFreq = type === 'down' ? 68 : 115;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.038);

      gain.gain.setValueAtTime(type === 'down' ? 0.16 : 0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch (err) {
      // Audio playback blocked or unavailable; silently ignore
    }
  }

  /* ------------------------------------------------------------------------
     Preferences Persistence (Theme, SFX)
     ------------------------------------------------------------------------ */
  function applyTheme(theme) {
    const resolved = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#1b1a18' : '#ece9e4');

    const isDark = resolved === 'dark';
    els.btnTheme.classList.toggle('is-active', isDark);
    els.btnTheme.setAttribute('aria-pressed', String(isDark));
    els.themeIcon.textContent = isDark ? '☀' : '◐';
    els.themeLabel.textContent = isDark ? 'Warm Stone' : 'Dark PBT';
    try {
      localStorage.setItem('lms_deadlines_theme', resolved);
    } catch (e) {}
  }

  function applySfxPref(enabled) {
    state.sfxEnabled = Boolean(enabled);
    els.btnSfx.classList.toggle('is-active', state.sfxEnabled);
    els.btnSfx.setAttribute('aria-pressed', String(state.sfxEnabled));
    try {
      localStorage.setItem('lms_deadlines_sfx', state.sfxEnabled ? '1' : '0');
    } catch (e) {}
  }

  function loadPreferences() {
    let savedTheme = 'light';
    let savedSfx = '0';
    try {
      savedTheme = localStorage.getItem('lms_deadlines_theme') || 'light';
      savedSfx = localStorage.getItem('lms_deadlines_sfx') || '0';
    } catch (e) {}
    applyTheme(savedTheme);
    applySfxPref(savedSfx === '1');
  }

  /* ------------------------------------------------------------------------
     Date & Countdown Formatting
     ------------------------------------------------------------------------ */
  function formatDueTimestamp(ms) {
    const dt = new Date(ms);
    const dateFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: AST_TIMEZONE,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: AST_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return `${dateFmt.format(dt)} · ${timeFmt.format(dt)} AST`;
  }

  function formatRelativeSync(isoStr) {
    if (!isoStr) return 'Synced';
    const ms = Date.parse(isoStr);
    if (Number.isNaN(ms)) return 'Synced';
    const diffMin = Math.max(0, Math.round((Date.now() - ms) / MIN_MS));
    if (diffMin < 1) return 'Synced just now';
    if (diffMin < 60) return `Synced ${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `Synced ${diffHr}h ago`;
    return `Synced ${Math.round(diffHr / 24)}d ago`;
  }

  function pad2(n) {
    return String(Math.floor(n)).padStart(2, '0');
  }

  function describeTiming(dueMs, nowMs) {
    const diff = dueMs - nowMs;
    if (diff >= 0) {
      let countdown;
      if (diff < HOUR_MS) {
        const m = Math.floor(diff / MIN_MS);
        const s = Math.floor((diff % MIN_MS) / 1000);
        countdown = `00:${pad2(m)}:${pad2(s)} left`;
      } else if (diff < DAY_MS) {
        const h = Math.floor(diff / HOUR_MS);
        const m = Math.floor((diff % HOUR_MS) / MIN_MS);
        const s = Math.floor((diff % MIN_MS) / 1000);
        countdown = `${pad2(h)}:${pad2(m)}:${pad2(s)} left`;
      } else {
        const days = Math.floor(diff / DAY_MS);
        const hours = Math.floor((diff % DAY_MS) / HOUR_MS);
        countdown = `${days}d ${hours}h left`;
      }

      let urgencyClass = 'urgency-normal';
      let urgencyLabel = 'Scheduled';
      if (diff <= 24 * HOUR_MS) {
        urgencyClass = 'urgency-urgent';
        urgencyLabel = 'Due < 24h';
      } else if (diff <= 72 * HOUR_MS) {
        urgencyClass = 'urgency-soon';
        urgencyLabel = 'Due Soon';
      }

      return {
        isPast: false,
        countdown,
        retentionText: '',
        urgencyClass,
        urgencyLabel,
      };
    }

    const elapsed = nowMs - dueMs;
    const daysAgo = Math.floor(elapsed / DAY_MS);
    const hoursAgo = Math.floor((elapsed % DAY_MS) / HOUR_MS);
    const minsAgo = Math.floor((elapsed % HOUR_MS) / MIN_MS);

    let agoStr;
    if (elapsed < HOUR_MS) {
      agoStr = `${Math.max(1, minsAgo)}m ago`;
    } else if (elapsed < DAY_MS) {
      agoStr = `${hoursAgo}h ${minsAgo}m ago`;
    } else {
      agoStr = `${daysAgo}d ${hoursAgo}h ago`;
    }

    const hideLeft = Math.max(0, PAST_DUE_WINDOW_MS - elapsed);
    const hideDays = Math.floor(hideLeft / DAY_MS);
    const hideHours = Math.floor((hideLeft % DAY_MS) / HOUR_MS);

    return {
      isPast: true,
      countdown: `PAST DUE · ${agoStr}`,
      retentionText: `Hides in ${hideDays}d ${hideHours}h`,
      urgencyClass: 'urgency-past',
      urgencyLabel: 'Past Due',
    };
  }

  /* ------------------------------------------------------------------------
     Filtering & Windowing (Strictly enforces 5-day past-due retention)
     ------------------------------------------------------------------------ */
  function getActiveWindowItems(nowMs = Date.now()) {
    return state.deadlines.filter((item) => {
      const age = nowMs - item.dueMs;
      return age <= PAST_DUE_WINDOW_MS;
    });
  }

  function matchesSearch(item, query) {
    if (!query) return true;
    const haystack = `${item.title} ${item.course_code} ${item.course_short_name} ${item.course_full_name} ${item.doctor}`.toLowerCase();
    return haystack.includes(query);
  }

  /* ------------------------------------------------------------------------
     ICS Calendar Generator
     ------------------------------------------------------------------------ */
  function escapeIcsText(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function toIcsUtc(ms) {
    const d = new Date(ms);
    return (
      d.getUTCFullYear() +
      pad2(d.getUTCMonth() + 1) +
      pad2(d.getUTCDate()) +
      'T' +
      pad2(d.getUTCHours()) +
      pad2(d.getUTCMinutes()) +
      pad2(d.getUTCSeconds()) +
      'Z'
    );
  }

  function downloadIcs(items, filename) {
    if (!items.length) {
      showToast('No upcoming deadlines in current filter to export.');
      return;
    }
    const stamp = toIcsUtc(Date.now());
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Hermes LMS Deadlines//7adel32//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    for (const item of items) {
      const start = toIcsUtc(item.dueMs);
      const end = toIcsUtc(item.dueMs + 15 * MIN_MS);
      const summary = `[${item.course_code}] ${item.title}`;
      const desc = `${item.course_full_name}${item.doctor ? ' — ' + item.doctor : ''}`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${item.id}@lms-deadlines.7adel32`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${escapeIcsText(summary)}`,
        `DESCRIPTION:${escapeIcsText(desc)}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT24H',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcsText(summary)} due in 24 hours`,
        'END:VALARM',
        'END:VEVENT'
      );
    }

    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Downloaded ${items.length} deadline${items.length === 1 ? '' : 's'} (.ics)`);
  }

  /* ------------------------------------------------------------------------
     Rendering
     ------------------------------------------------------------------------ */
  function renderCourseChips(windowItems) {
    const query = state.searchQuery.trim().toLowerCase();
    const visibleForCounts = windowItems.filter((item) => {
      if (!state.showPastDue && item.dueMs < Date.now()) return false;
      return matchesSearch(item, query);
    });

    const countBySlug = new Map();
    for (const item of visibleForCounts) {
      countBySlug.set(item.course_slug, (countBySlug.get(item.course_slug) || 0) + 1);
    }

    const totalCount = visibleForCounts.length;
    const allActive = state.selectedCourse === null;

    const chips = [
      `<button type="button" class="squishy-btn course-chip${allActive ? ' is-active' : ''}" data-course="" aria-pressed="${allActive}">
        <span class="chip-led chip-all-led" aria-hidden="true"></span>
        <span class="chip-name">All Courses</span>
        <span class="chip-count">${totalCount}</span>
      </button>`,
    ];

    for (const course of state.courses) {
      const isSelected = state.selectedCourse === course.slug;
      const count = countBySlug.get(course.slug) || 0;
      const accentClass = `accent-${course.accent_index % 6}`;
      chips.push(
        `<button type="button" class="squishy-btn course-chip ${accentClass}${isSelected ? ' is-active' : ''}" data-course="${escapeHtml(course.slug)}" aria-pressed="${isSelected}" title="${escapeHtml(course.full_name)}">
          <span class="chip-led" aria-hidden="true"></span>
          <span class="chip-code">${escapeHtml(course.code)}</span>
          <span class="chip-name" dir="auto">${escapeHtml(course.short_name)}</span>
          <span class="chip-count">${count}</span>
        </button>`
      );
    }

    els.courseRack.innerHTML = chips.join('');
  }

  function renderCardHtml(item, nowMs, staggerIndex) {
    const timing = describeTiming(item.dueMs, nowMs);
    const accentClass = `accent-${item.accent_index % 6}`;
    const pastClass = timing.isPast ? ' is-past' : '';
    const formattedDate = formatDueTimestamp(item.dueMs);

    return `
      <article
        class="deadline-card ${accentClass}${pastClass}"
        style="--stagger: ${Math.min(staggerIndex, 10)}"
        data-deadline-id="${escapeHtml(item.id)}"
        data-due-ms="${item.dueMs}"
      >
        <div class="card-top-row">
          <div class="course-tag">
            <span class="course-bar" aria-hidden="true"></span>
            <div class="course-meta-text">
              <span class="course-code-inline">${escapeHtml(item.course_code)}</span>
              <span class="course-short-inline" dir="auto">${escapeHtml(item.course_short_name)}</span>
            </div>
          </div>
          <span class="urgency-pill ${timing.urgencyClass}">
            <span class="urgency-dot" aria-hidden="true"></span>
            <span class="js-urgency-label">${timing.urgencyLabel}</span>
          </span>
        </div>

        <h3 class="card-title" dir="auto">${escapeHtml(item.title)}</h3>

        <div class="card-lcd">
          <div class="lcd-countdown-row">
            <span class="lcd-countdown js-countdown">${escapeHtml(timing.countdown)}</span>
            <span class="lcd-retention js-retention">${escapeHtml(timing.retentionText)}</span>
          </div>
          <div class="lcd-datetime">${escapeHtml(formattedDate)}</div>
        </div>

        <div class="card-footer-row">
          <span class="doctor-label" dir="auto">${escapeHtml(item.doctor || 'Course Instructor')}</span>
        </div>
      </article>
    `;
  }

  function renderAll() {
    const nowMs = Date.now();
    const windowItems = getActiveWindowItems(nowMs);
    const query = state.searchQuery.trim().toLowerCase();

    // Update telemetry counters (respecting active course + search filter, across full 5-day window)
    const courseAndQueryItems = windowItems.filter((item) => {
      if (state.selectedCourse && item.course_slug !== state.selectedCourse) return false;
      return matchesSearch(item, query);
    });

    const upcomingAll = courseAndQueryItems
      .filter((item) => item.dueMs >= nowMs)
      .sort((a, b) => a.dueMs - b.dueMs);

    const pastAll = courseAndQueryItems
      .filter((item) => item.dueMs < nowMs)
      .sort((a, b) => b.dueMs - a.dueMs); // Most recently due first

    const soonCount = upcomingAll.filter((item) => item.dueMs - nowMs <= 48 * HOUR_MS).length;

    els.statUpcoming.textContent = String(upcomingAll.length);
    els.statSoon.textContent = String(soonCount);
    els.statPast.textContent = String(pastAll.length);
    els.pastDueBtnCount.textContent = String(pastAll.length);

    renderCourseChips(windowItems);

    // Render Upcoming Section
    if (upcomingAll.length > 0) {
      els.upcomingSection.classList.remove('is-hidden');
      els.upcomingCountBadge.textContent = `${upcomingAll.length} item${upcomingAll.length === 1 ? '' : 's'}`;
      els.upcomingGrid.innerHTML = upcomingAll
        .map((item, idx) => renderCardHtml(item, nowMs, idx))
        .join('');
    } else {
      els.upcomingSection.classList.add('is-hidden');
      els.upcomingGrid.innerHTML = '';
    }

    // Render Past-Due Section (<= 5 days)
    const visiblePast = state.showPastDue ? pastAll : [];
    if (visiblePast.length > 0) {
      els.pastSection.classList.remove('is-hidden');
      els.pastCountBadge.textContent = `${visiblePast.length} item${visiblePast.length === 1 ? '' : 's'}`;
      els.pastGrid.innerHTML = visiblePast
        .map((item, idx) => renderCardHtml(item, nowMs, idx))
        .join('');
    } else {
      els.pastSection.classList.add('is-hidden');
      els.pastGrid.innerHTML = '';
    }

    // Empty State
    const nothingVisible = upcomingAll.length === 0 && visiblePast.length === 0;
    const hasFilters = Boolean(state.selectedCourse || query || !state.showPastDue);
    if (nothingVisible) {
      els.emptyState.classList.remove('is-hidden');
      els.btnResetFilters.classList.toggle('is-hidden', !hasFilters);
      if (!state.showPastDue && pastAll.length > 0) {
        els.emptyDesc.textContent = `No upcoming deadlines match right now, and ${pastAll.length} recently past-due item${pastAll.length === 1 ? ' is' : 's are'} hidden.`;
      } else if (hasFilters) {
        els.emptyDesc.textContent = 'No deadlines match the selected course or search filter.';
      } else {
        els.emptyDesc.textContent = 'No upcoming or 5-day past-due deadlines are currently posted.';
      }
    } else {
      els.emptyState.classList.add('is-hidden');
    }

    els.btnClearSearch.classList.toggle('is-hidden', !state.searchQuery);
  }

  /* Lightweight 1-second ticker that updates countdowns in-place without flickering cards */
  function tickCountdowns() {
    const nowMs = Date.now();
    const cards = document.querySelectorAll('.deadline-card');
    let needsStructuralReflow = false;

    for (const card of cards) {
      const dueMs = Number(card.dataset.dueMs);
      const wasPast = card.classList.contains('is-past');
      const age = nowMs - dueMs;

      if (age > PAST_DUE_WINDOW_MS) {
        needsStructuralReflow = true;
        continue;
      }

      const timing = describeTiming(dueMs, nowMs);
      if (timing.isPast !== wasPast) {
        needsStructuralReflow = true;
        continue;
      }

      const cdEl = card.querySelector('.js-countdown');
      if (cdEl) cdEl.textContent = timing.countdown;

      const retEl = card.querySelector('.js-retention');
      if (retEl) retEl.textContent = timing.retentionText;

      const pill = card.querySelector('.urgency-pill');
      if (pill && !pill.classList.contains(timing.urgencyClass)) {
        pill.className = `urgency-pill ${timing.urgencyClass}`;
        const label = pill.querySelector('.js-urgency-label');
        if (label) label.textContent = timing.urgencyLabel;
      }
    }

    if (needsStructuralReflow) {
      renderAll();
    }
    if (state.generatedAt) {
      els.syncText.textContent = formatRelativeSync(state.generatedAt);
    }
  }

  /* ------------------------------------------------------------------------
     Feed Fetching
     ------------------------------------------------------------------------ */
  async function loadFeed() {
    els.loadingState.classList.remove('is-hidden');
    els.errorState.classList.add('is-hidden');
    els.syncStatus.classList.remove('is-error');
    els.syncText.textContent = 'Syncing feed…';

    try {
      const cacheBuster = Math.floor(Date.now() / 60000);
      const resp = await fetch(`./deadlines.json?t=${cacheBuster}`, { cache: 'no-store' });
      if (!resp.ok) {
        throw new Error(`Feed returned HTTP ${resp.status}`);
      }
      const data = await resp.json();

      const courses = Array.isArray(data.courses) ? data.courses : [];
      const rawDeadlines = Array.isArray(data.deadlines) ? data.deadlines : [];

      const parsed = [];
      for (const item of rawDeadlines) {
        const dueMs = Date.parse(item.due_iso);
        if (Number.isNaN(dueMs)) continue;
        parsed.push({
          id: String(item.id || `${item.course_slug}-${item.title}-${item.due_iso}`),
          title: String(item.title || 'Untitled Deadline'),
          course_slug: String(item.course_slug || 'course'),
          course_code: String(item.course_code || 'COURSE'),
          course_short_name: String(item.course_short_name || item.course_full_name || 'Course'),
          course_full_name: String(item.course_full_name || item.course_short_name || 'Course'),
          doctor: String(item.doctor || ''),
          due_iso: String(item.due_iso),
          dueMs,
          accent_index: Number.isFinite(Number(item.accent_index)) ? Number(item.accent_index) : 0,
        });
      }

      state.courses = courses;
      state.deadlines = parsed;
      state.generatedAt = data.generated_at || null;

      els.loadingState.classList.add('is-hidden');
      els.syncText.textContent = formatRelativeSync(state.generatedAt);
      if (state.generatedAt) {
        els.footerSyncMeta.textContent = `Last feed update: ${formatDueTimestamp(Date.parse(state.generatedAt))} · Retention: ${data.past_due_retention_days || 5} days past due`;
      }
      renderAll();
    } catch (err) {
      els.loadingState.classList.add('is-hidden');
      els.upcomingSection.classList.add('is-hidden');
      els.pastSection.classList.add('is-hidden');
      els.emptyState.classList.add('is-hidden');
      els.errorState.classList.remove('is-hidden');
      els.syncStatus.classList.add('is-error');
      els.syncText.textContent = 'Feed offline';
      els.errorMessage.textContent = err && err.message ? err.message : 'Could not fetch deadlines.json';
    }
  }

  /* ------------------------------------------------------------------------
     Event Wiring
     ------------------------------------------------------------------------ */
  function bindEvents() {
    els.btnPastDue.addEventListener('click', () => {
      playKeySound('down');
      state.showPastDue = !state.showPastDue;
      els.btnPastDue.classList.toggle('is-active', state.showPastDue);
      els.btnPastDue.setAttribute('aria-pressed', String(state.showPastDue));
      renderAll();
    });

    els.btnSfx.addEventListener('click', () => {
      const next = !state.sfxEnabled;
      applySfxPref(next);
      if (next) {
        playKeySound('down');
        showToast('Mechanical click SFX enabled');
      } else {
        showToast('Click SFX muted');
      }
    });

    els.btnTheme.addEventListener('click', () => {
      playKeySound('down');
      const current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    els.btnExportAll.addEventListener('click', () => {
      playKeySound('down');
      const nowMs = Date.now();
      const query = state.searchQuery.trim().toLowerCase();
      const filteredUpcoming = getActiveWindowItems(nowMs)
        .filter((item) => {
          if (item.dueMs < nowMs) return false;
          if (state.selectedCourse && item.course_slug !== state.selectedCourse) return false;
          return matchesSearch(item, query);
        })
        .sort((a, b) => a.dueMs - b.dueMs);
      const suffix = state.selectedCourse || 'all-courses';
      downloadIcs(filteredUpcoming, `lms-deadlines-${suffix}.ics`);
    });

    els.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderAll();
    });

    els.btnClearSearch.addEventListener('click', () => {
      playKeySound('up');
      state.searchQuery = '';
      els.searchInput.value = '';
      els.searchInput.focus();
      renderAll();
    });

    els.btnResetFilters.addEventListener('click', () => {
      playKeySound('up');
      state.selectedCourse = null;
      state.searchQuery = '';
      state.showPastDue = true;
      els.searchInput.value = '';
      els.btnPastDue.classList.add('is-active');
      els.btnPastDue.setAttribute('aria-pressed', 'true');
      renderAll();
    });

    els.btnRetry.addEventListener('click', () => {
      playKeySound('down');
      loadFeed();
    });

    // Course Filter Chip clicks (delegated)
    els.courseRack.addEventListener('click', (e) => {
      const chip = e.target.closest('.course-chip');
      if (!chip) return;
      playKeySound('down');
      const slug = chip.dataset.course || '';
      if (!slug) {
        state.selectedCourse = null;
      } else if (state.selectedCourse === slug) {
        state.selectedCourse = null;
      } else {
        state.selectedCourse = slug;
      }
      renderAll();
    });

    // Lightweight pointer-tracking specular sheen
    document.getElementById('board-main').addEventListener('pointermove', (e) => {
      const card = e.target.closest('.deadline-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mx', `${x.toFixed(1)}%`);
      card.style.setProperty('--my', `${y.toFixed(1)}%`);
    });
  }

  function init() {
    loadPreferences();
    bindEvents();
    loadFeed();
    setInterval(tickCountdowns, 1000);
  }

  init();
})();
