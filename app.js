(() => {
  'use strict';

  const AST_TIMEZONE = 'Asia/Riyadh';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;
  const MIN_MS = 60 * 1000;
  const PAST_DUE_WINDOW_MS = 5 * DAY_MS;
  const WEEK_MS = 7 * DAY_MS;

  const state = {
    activeView: 'deadlines', // 'deadlines' | 'announcements'
    viewMenuOpen: false,
    courses: [],
    deadlines: [],
    announcements: [],
    deadlinesGeneratedAt: null,
    announcementsGeneratedAt: null,
    deadlinesRetentionDays: 5,
    deadlinesError: null,
    announcementsError: null,
    selectedCourse: null, // null = All Courses
    showPastDue: true,
    searchQuery: '',
    openAnnouncementId: null,
    lastFocusedCard: null,
  };

  const els = {
    syncStatus: document.getElementById('sync-status'),
    syncText: document.getElementById('sync-text'),
    viewSwitcher: document.getElementById('view-switcher'),
    btnViewMenu: document.getElementById('btn-view-menu'),
    viewMenuLabel: document.getElementById('view-menu-label'),
    viewMenuList: document.getElementById('view-menu-list'),
    btnPastDue: document.getElementById('btn-past-due'),
    pastDueBtnCount: document.getElementById('past-due-btn-count'),
    btnTheme: document.getElementById('btn-theme'),
    themeIcon: document.getElementById('theme-icon'),
    themeLabel: document.getElementById('theme-label'),
    btnExportAll: document.getElementById('btn-export-all'),
    statLabel1: document.getElementById('stat-label-1'),
    statLabel2: document.getElementById('stat-label-2'),
    statLabel3: document.getElementById('stat-label-3'),
    statSub1: document.getElementById('stat-sub-1'),
    statSub2: document.getElementById('stat-sub-2'),
    statSub3: document.getElementById('stat-sub-3'),
    statWell2: document.getElementById('stat-well-2'),
    statUpcoming: document.getElementById('stat-upcoming'),
    statSoon: document.getElementById('stat-soon'),
    statPast: document.getElementById('stat-past'),
    searchLabel: document.getElementById('search-label'),
    searchInput: document.getElementById('search-input'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    courseRack: document.getElementById('course-rack'),
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    errorTitle: document.getElementById('error-title'),
    errorMessage: document.getElementById('error-message'),
    btnRetry: document.getElementById('btn-retry'),
    upcomingSection: document.getElementById('upcoming-section'),
    upcomingCountBadge: document.getElementById('upcoming-count-badge'),
    upcomingGrid: document.getElementById('upcoming-grid'),
    pastSection: document.getElementById('past-section'),
    pastCountBadge: document.getElementById('past-count-badge'),
    pastGrid: document.getElementById('past-grid'),
    announcementsSection: document.getElementById('announcements-section'),
    announcementsCountBadge: document.getElementById('announcements-count-badge'),
    announcementsGrid: document.getElementById('announcements-grid'),
    emptyState: document.getElementById('empty-state'),
    emptyTitle: document.getElementById('empty-title'),
    emptyDesc: document.getElementById('empty-desc'),
    btnResetFilters: document.getElementById('btn-reset-filters'),
    footerSyncMeta: document.getElementById('footer-sync-meta'),
    annModal: document.getElementById('ann-modal'),
    annModalDialog: document.getElementById('ann-modal-dialog'),
    annModalCode: document.getElementById('ann-modal-code'),
    annModalCourse: document.getElementById('ann-modal-course'),
    annModalAge: document.getElementById('ann-modal-age'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    annModalTitle: document.getElementById('ann-modal-title'),
    annModalBodyWell: document.getElementById('ann-modal-body-well'),
    annModalBody: document.getElementById('ann-modal-body'),
    annModalExtras: document.getElementById('ann-modal-extras'),
    annModalDoctor: document.getElementById('ann-modal-doctor'),
    annModalDate: document.getElementById('ann-modal-date'),
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isSafeHttpUrl(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
  }

  /* ------------------------------------------------------------------------
     Preferences Persistence (Theme only)
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
    els.themeLabel.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    try {
      localStorage.setItem('lms_deadlines_theme', resolved);
    } catch (e) {}
  }

  function loadPreferences() {
    let savedTheme = 'light';
    try {
      savedTheme = localStorage.getItem('lms_deadlines_theme') || 'light';
    } catch (e) {}
    applyTheme(savedTheme);
  }

  /* ------------------------------------------------------------------------
     Title Pull-Down View Switcher
     ------------------------------------------------------------------------ */
  function parseViewFromHash() {
    const raw = (window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
    return raw === 'announcements' ? 'announcements' : 'deadlines';
  }

  function setViewMenuOpen(open) {
    state.viewMenuOpen = Boolean(open);
    els.btnViewMenu.setAttribute('aria-expanded', String(state.viewMenuOpen));
    els.viewMenuList.classList.toggle('is-hidden', !state.viewMenuOpen);
  }

  function syncViewChrome() {
    const isAnn = state.activeView === 'announcements';
    els.viewMenuLabel.textContent = isAnn ? 'Announcements' : 'Deadlines';
    document.title = isAnn ? 'Course Announcements — LMS Board' : 'Course Deadlines — LMS Board';

    const options = els.viewMenuList.querySelectorAll('.title-dropdown-option');
    for (const opt of options) {
      const selected = opt.dataset.view === state.activeView;
      opt.classList.toggle('is-active', selected);
      opt.setAttribute('aria-selected', String(selected));
    }

    // Hide deadline-only controls in Announcements view
    els.btnPastDue.classList.toggle('is-hidden', isAnn);
    els.btnExportAll.classList.toggle('is-hidden', isAnn);

    // Update search prompt & telemetry labels
    if (isAnn) {
      els.searchLabel.textContent = 'Search announcements by title, body, course, or lecturer';
      els.searchInput.placeholder = 'Search announcements by title, body, course, or lecturer…';
      els.statLabel1.textContent = 'TOTAL';
      els.statSub1.textContent = 'posted';
      els.statLabel2.textContent = 'THIS WEEK';
      els.statSub2.textContent = '≤ 7 days';
      els.statLabel3.textContent = 'COURSES';
      els.statSub3.textContent = 'active';
      els.statWell2.classList.remove('lcd-well-warn');
      els.statWell2.classList.add('lcd-well-accent');
    } else {
      els.searchLabel.textContent = 'Filter deadlines by title, course, or instructor';
      els.searchInput.placeholder = 'Filter by task, course code, or instructor…';
      els.statLabel1.textContent = 'UPCOMING';
      els.statSub1.textContent = 'active';
      els.statLabel2.textContent = 'DUE ≤ 48H';
      els.statSub2.textContent = 'priority';
      els.statLabel3.textContent = 'PAST DUE ≤ 5D';
      els.statSub3.textContent = 'retained';
      els.statWell2.classList.add('lcd-well-warn');
      els.statWell2.classList.remove('lcd-well-accent');
    }

    updateFeedMetaChrome();
  }

  function setActiveView(view, updateHash = true) {
    const next = view === 'announcements' ? 'announcements' : 'deadlines';
    state.activeView = next;
    setViewMenuOpen(false);
    syncViewChrome();
    if (updateHash) {
      const desiredHash = next === 'announcements' ? '#announcements' : '#deadlines';
      if (window.location.hash !== desiredHash) {
        try {
          window.history.replaceState(null, '', desiredHash);
        } catch (e) {}
      }
    }
    renderAll();
  }

  /* ------------------------------------------------------------------------
     Date & Countdown Formatting
     ------------------------------------------------------------------------ */
  function formatAstTimestamp(ms) {
    if (!Number.isFinite(ms)) return '';
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

  function formatShortAstDate(ms) {
    if (!Number.isFinite(ms)) return 'Posted';
    const nowMs = Date.now();
    const diff = nowMs - ms;
    if (diff >= 0 && diff < HOUR_MS) {
      const m = Math.max(1, Math.floor(diff / MIN_MS));
      return `${m}m ago`;
    }
    if (diff >= 0 && diff < DAY_MS) {
      const h = Math.floor(diff / HOUR_MS);
      return `${h}h ago`;
    }
    if (diff >= 0 && diff < 7 * DAY_MS) {
      const d = Math.floor(diff / DAY_MS);
      return `${d}d ago`;
    }
    return new Intl.DateTimeFormat('en-US', {
      timeZone: AST_TIMEZONE,
      month: 'short',
      day: 'numeric',
    }).format(new Date(ms));
  }

  function formatRelativeUpdated(isoStr) {
    if (!isoStr) return 'Up to date';
    const ms = Date.parse(isoStr);
    if (Number.isNaN(ms)) return 'Up to date';
    const diffMin = Math.max(0, Math.round((Date.now() - ms) / MIN_MS));
    if (diffMin < 1) return 'Updated just now';
    if (diffMin < 60) return `Updated ${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `Updated ${diffHr}h ago`;
    return `Updated ${Math.round(diffHr / 24)}d ago`;
  }

  function getActiveGeneratedAt() {
    if (state.activeView === 'announcements') {
      return state.announcementsGeneratedAt || state.deadlinesGeneratedAt;
    }
    return state.deadlinesGeneratedAt || state.announcementsGeneratedAt;
  }

  function updateFeedMetaChrome() {
    const isAnn = state.activeView === 'announcements';
    const activeErr = isAnn ? state.announcementsError : state.deadlinesError;
    const genAt = getActiveGeneratedAt();

    if (activeErr) {
      els.syncStatus.classList.add('is-error');
      els.syncText.textContent = 'Feed offline';
    } else if (genAt) {
      els.syncStatus.classList.remove('is-error');
      els.syncText.textContent = formatRelativeUpdated(genAt);
    }

    if (genAt && !Number.isNaN(Date.parse(genAt))) {
      const stamp = formatAstTimestamp(Date.parse(genAt));
      if (isAnn) {
        els.footerSyncMeta.textContent = `Last change: ${stamp} · Current-term course announcements`;
      } else {
        els.footerSyncMeta.textContent = `Last change: ${stamp} · Retention: ${state.deadlinesRetentionDays} days past due`;
      }
    } else {
      els.footerSyncMeta.textContent = isAnn
        ? 'Current-term course announcements'
        : `Retention window: ${state.deadlinesRetentionDays} days past due`;
    }
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
     Filtering & Windowing
     ------------------------------------------------------------------------ */
  function getActiveWindowItems(nowMs = Date.now()) {
    return state.deadlines.filter((item) => {
      const age = nowMs - item.dueMs;
      return age <= PAST_DUE_WINDOW_MS;
    });
  }

  function matchesDeadlineSearch(item, query) {
    if (!query) return true;
    const haystack = `${item.title} ${item.course_code} ${item.course_short_name} ${item.course_full_name} ${item.doctor}`.toLowerCase();
    return haystack.includes(query);
  }

  function matchesAnnouncementSearch(item, query) {
    if (!query) return true;
    const attText = Array.isArray(item.attachments) ? item.attachments.join(' ') : '';
    const haystack = `${item.title} ${item.body} ${item.course_code} ${item.course_short_name} ${item.course_full_name} ${item.doctor} ${attText}`.toLowerCase();
    return haystack.includes(query);
  }

  /* ------------------------------------------------------------------------
     ICS Calendar Generator (Deadlines view)
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
    if (!items.length) return;
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
  }

  /* ------------------------------------------------------------------------
     Rendering
     ------------------------------------------------------------------------ */
  function renderCourseChips(itemsForCounts) {
    const countBySlug = new Map();
    for (const item of itemsForCounts) {
      countBySlug.set(item.course_slug, (countBySlug.get(item.course_slug) || 0) + 1);
    }

    const totalCount = itemsForCounts.length;
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

  function renderDeadlineCardHtml(item, nowMs, staggerIndex) {
    const timing = describeTiming(item.dueMs, nowMs);
    const accentClass = `accent-${item.accent_index % 6}`;
    const pastClass = timing.isPast ? ' is-past' : '';
    const formattedDate = formatAstTimestamp(item.dueMs);

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

  function buildAnnouncementExtrasHtml(item) {
    const linkChips = (item.links || [])
      .filter((lnk) => lnk && isSafeHttpUrl(lnk.url))
      .map(
        (lnk) => `
          <a
            class="squishy-btn ann-link-chip"
            href="${escapeHtml(lnk.url)}"
            target="_blank"
            rel="noopener noreferrer"
            title="${escapeHtml(lnk.url)}"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            <span class="ann-link-text" dir="auto">${escapeHtml(lnk.title || 'External Link')}</span>
          </a>
        `
      )
      .join('');

    const attBadges = (item.attachments || [])
      .map(
        (fname) => `
          <span class="ann-attachment-pill" title="Attachment on Blackboard: ${escapeHtml(fname)}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
            </svg>
            <span class="ann-attachment-text" dir="auto">${escapeHtml(fname)}</span>
          </span>
        `
      )
      .join('');

    return `${linkChips}${attBadges}`;
  }

  function renderAnnouncementCardHtml(item, staggerIndex) {
    const accentClass = `accent-${item.accent_index % 6}`;
    const shortAge = Number.isFinite(item.postedMs) ? formatShortAstDate(item.postedMs) : 'Posted';
    const fullDate = Number.isFinite(item.postedMs) ? formatAstTimestamp(item.postedMs) : '';
    const extrasInner = buildAnnouncementExtrasHtml(item);
    const extrasHtml = extrasInner ? `<div class="announcement-extras">${extrasInner}</div>` : '';

    const bodyHtml = item.body
      ? `
        <div class="announcement-body-well">
          <p class="announcement-body-text" dir="auto">${escapeHtml(item.body)}</p>
        </div>
      `
      : '';

    return `
      <article
        class="announcement-card ${accentClass}"
        style="--stagger: ${Math.min(staggerIndex, 10)}"
        data-announcement-id="${escapeHtml(item.id)}"
        tabindex="0"
        role="button"
        aria-label="Open announcement: ${escapeHtml(item.title)}"
      >
        <div class="card-top-row">
          <div class="course-tag">
            <span class="course-bar" aria-hidden="true"></span>
            <div class="course-meta-text">
              <span class="course-code-inline">${escapeHtml(item.course_code)}</span>
              <span class="course-short-inline" dir="auto">${escapeHtml(item.course_short_name)}</span>
            </div>
          </div>
          <span class="posted-pill" title="${escapeHtml(fullDate)}">${escapeHtml(shortAge)}</span>
        </div>

        <h3 class="card-title" dir="auto">${escapeHtml(item.title)}</h3>

        ${bodyHtml}
        ${extrasHtml}

        <div class="card-footer-row">
          <span class="doctor-label" dir="auto">${escapeHtml(item.doctor || 'Course Lecturer')}</span>
          ${fullDate ? `<span class="ann-date-full">${escapeHtml(fullDate)}</span>` : ''}
        </div>
      </article>
    `;
  }

  function measureTruncatedAnnouncements() {
    const wells = els.announcementsGrid.querySelectorAll('.announcement-body-well');
    for (const well of wells) {
      well.classList.remove('is-truncated');
      if (well.scrollHeight > well.clientHeight + 2) {
        well.classList.add('is-truncated');
      }
    }
  }

  function openAnnouncementModal(annId, triggerCard = null) {
    const item = state.announcements.find((a) => a.id === annId);
    if (!item) return;

    state.openAnnouncementId = annId;
    state.lastFocusedCard = triggerCard;

    const accentClass = `accent-${item.accent_index % 6}`;
    els.annModalDialog.className = `ann-modal-dialog ${accentClass}`;
    els.annModalCode.textContent = item.course_code;
    els.annModalCourse.textContent = item.course_short_name;

    const shortAge = Number.isFinite(item.postedMs) ? formatShortAstDate(item.postedMs) : 'Posted';
    const fullDate = Number.isFinite(item.postedMs) ? formatAstTimestamp(item.postedMs) : '';
    els.annModalAge.textContent = shortAge;
    els.annModalAge.title = fullDate;
    els.annModalTitle.textContent = item.title;

    if (item.body) {
      els.annModalBodyWell.classList.remove('is-hidden');
      els.annModalBody.textContent = item.body;
      els.annModalBodyWell.scrollTop = 0;
    } else {
      els.annModalBodyWell.classList.add('is-hidden');
      els.annModalBody.textContent = '';
    }

    const extrasInner = buildAnnouncementExtrasHtml(item);
    if (extrasInner) {
      els.annModalExtras.innerHTML = extrasInner;
      els.annModalExtras.classList.remove('is-hidden');
    } else {
      els.annModalExtras.innerHTML = '';
      els.annModalExtras.classList.add('is-hidden');
    }

    els.annModalDoctor.textContent = item.doctor || 'Course Lecturer';
    els.annModalDate.textContent = fullDate;

    els.annModal.classList.remove('is-hidden');
    document.body.classList.add('modal-open');
    els.btnCloseModal.focus();
  }

  function closeAnnouncementModal() {
    if (!state.openAnnouncementId) return;
    state.openAnnouncementId = null;
    els.annModal.classList.add('is-hidden');
    document.body.classList.remove('modal-open');
    if (state.lastFocusedCard && document.contains(state.lastFocusedCard)) {
      state.lastFocusedCard.focus();
    }
    state.lastFocusedCard = null;
  }

  function renderDeadlinesView() {
    els.announcementsSection.classList.add('is-hidden');
    els.announcementsGrid.innerHTML = '';

    if (state.deadlinesError) {
      els.upcomingSection.classList.add('is-hidden');
      els.pastSection.classList.add('is-hidden');
      els.emptyState.classList.add('is-hidden');
      els.errorState.classList.remove('is-hidden');
      els.errorTitle.textContent = 'Could not load deadlines feed';
      els.errorMessage.textContent = state.deadlinesError;
      return;
    }

    els.errorState.classList.add('is-hidden');
    const nowMs = Date.now();
    const windowItems = getActiveWindowItems(nowMs);
    const query = state.searchQuery.trim().toLowerCase();

    const visibleForCounts = windowItems.filter((item) => {
      if (!state.showPastDue && item.dueMs < nowMs) return false;
      return matchesDeadlineSearch(item, query);
    });
    renderCourseChips(visibleForCounts);

    const courseAndQueryItems = windowItems.filter((item) => {
      if (state.selectedCourse && item.course_slug !== state.selectedCourse) return false;
      return matchesDeadlineSearch(item, query);
    });

    const upcomingAll = courseAndQueryItems
      .filter((item) => item.dueMs >= nowMs)
      .sort((a, b) => a.dueMs - b.dueMs);

    const pastAll = courseAndQueryItems
      .filter((item) => item.dueMs < nowMs)
      .sort((a, b) => b.dueMs - a.dueMs);

    const soonCount = upcomingAll.filter((item) => item.dueMs - nowMs <= 48 * HOUR_MS).length;

    els.statUpcoming.textContent = String(upcomingAll.length);
    els.statSoon.textContent = String(soonCount);
    els.statPast.textContent = String(pastAll.length);
    els.pastDueBtnCount.textContent = String(pastAll.length);
    els.btnExportAll.disabled = upcomingAll.length === 0;

    if (upcomingAll.length > 0) {
      els.upcomingSection.classList.remove('is-hidden');
      els.upcomingCountBadge.textContent = `${upcomingAll.length} item${upcomingAll.length === 1 ? '' : 's'}`;
      els.upcomingGrid.innerHTML = upcomingAll
        .map((item, idx) => renderDeadlineCardHtml(item, nowMs, idx))
        .join('');
    } else {
      els.upcomingSection.classList.add('is-hidden');
      els.upcomingGrid.innerHTML = '';
    }

    const visiblePast = state.showPastDue ? pastAll : [];
    if (visiblePast.length > 0) {
      els.pastSection.classList.remove('is-hidden');
      els.pastCountBadge.textContent = `${visiblePast.length} item${visiblePast.length === 1 ? '' : 's'}`;
      els.pastGrid.innerHTML = visiblePast
        .map((item, idx) => renderDeadlineCardHtml(item, nowMs, idx))
        .join('');
    } else {
      els.pastSection.classList.add('is-hidden');
      els.pastGrid.innerHTML = '';
    }

    const nothingVisible = upcomingAll.length === 0 && visiblePast.length === 0;
    const hasFilters = Boolean(state.selectedCourse || query || !state.showPastDue);
    if (nothingVisible) {
      els.emptyState.classList.remove('is-hidden');
      els.emptyTitle.textContent = 'No matching deadlines';
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
  }

  function renderAnnouncementsView() {
    els.upcomingSection.classList.add('is-hidden');
    els.upcomingGrid.innerHTML = '';
    els.pastSection.classList.add('is-hidden');
    els.pastGrid.innerHTML = '';

    if (state.announcementsError) {
      els.announcementsSection.classList.add('is-hidden');
      els.emptyState.classList.add('is-hidden');
      els.errorState.classList.remove('is-hidden');
      els.errorTitle.textContent = 'Could not load announcements feed';
      els.errorMessage.textContent = state.announcementsError;
      return;
    }

    els.errorState.classList.add('is-hidden');
    const nowMs = Date.now();
    const query = state.searchQuery.trim().toLowerCase();

    const queryMatched = state.announcements.filter((item) => matchesAnnouncementSearch(item, query));
    renderCourseChips(queryMatched);

    const filtered = queryMatched
      .filter((item) => !state.selectedCourse || item.course_slug === state.selectedCourse)
      .sort((a, b) => (b.postedMs || 0) - (a.postedMs || 0));

    const recentWeekCount = filtered.filter(
      (item) => Number.isFinite(item.postedMs) && nowMs - item.postedMs <= WEEK_MS
    ).length;
    const activeCoursesCount = new Set(filtered.map((item) => item.course_slug)).size;

    els.statUpcoming.textContent = String(filtered.length);
    els.statSoon.textContent = String(recentWeekCount);
    els.statPast.textContent = String(activeCoursesCount);

    if (filtered.length > 0) {
      els.announcementsSection.classList.remove('is-hidden');
      els.announcementsCountBadge.textContent = `${filtered.length} post${filtered.length === 1 ? '' : 's'}`;
      els.announcementsGrid.innerHTML = filtered
        .map((item, idx) => renderAnnouncementCardHtml(item, idx))
        .join('');
      els.emptyState.classList.add('is-hidden');
      measureTruncatedAnnouncements();
    } else {
      els.announcementsSection.classList.add('is-hidden');
      els.announcementsGrid.innerHTML = '';
      const hasFilters = Boolean(state.selectedCourse || query);
      els.emptyState.classList.remove('is-hidden');
      els.emptyTitle.textContent = 'No matching announcements';
      els.btnResetFilters.classList.toggle('is-hidden', !hasFilters);
      els.emptyDesc.textContent = hasFilters
        ? 'No lecturer announcements match the selected course or search filter.'
        : 'No current-term lecturer announcements are currently posted.';
    }
  }

  function renderAll() {
    updateFeedMetaChrome();
    if (state.activeView === 'announcements') {
      renderAnnouncementsView();
    } else {
      renderDeadlinesView();
    }
    els.btnClearSearch.classList.toggle('is-hidden', !state.searchQuery);
  }

  /* Lightweight 1-second ticker that updates deadline countdowns in-place */
  function tickCountdowns() {
    if (state.activeView === 'deadlines') {
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
        return;
      }
    }

    const genAt = getActiveGeneratedAt();
    if (genAt && !els.syncStatus.classList.contains('is-error')) {
      els.syncText.textContent = formatRelativeUpdated(genAt);
    }
  }

  /* ------------------------------------------------------------------------
     Feed Fetching (Deadlines + Announcements in parallel)
     ------------------------------------------------------------------------ */
  function mergeCourses(primaryCourses, secondaryCourses) {
    const bySlug = new Map();
    for (const c of [...primaryCourses, ...secondaryCourses]) {
      if (c && c.slug && !bySlug.has(c.slug)) {
        bySlug.set(c.slug, c);
      }
    }
    return Array.from(bySlug.values()).sort((a, b) => (a.accent_index || 0) - (b.accent_index || 0));
  }

  async function fetchJsonFeed(path) {
    const cacheBuster = Math.floor(Date.now() / 60000);
    const resp = await fetch(`${path}?t=${cacheBuster}`, { cache: 'no-store' });
    if (!resp.ok) {
      throw new Error(`Feed returned HTTP ${resp.status}`);
    }
    return resp.json();
  }

  async function loadFeed() {
    els.loadingState.classList.remove('is-hidden');
    els.errorState.classList.add('is-hidden');
    els.syncStatus.classList.remove('is-error');
    els.syncText.textContent = 'Loading feed…';

    const [dlRes, annRes] = await Promise.allSettled([
      fetchJsonFeed('./deadlines.json'),
      fetchJsonFeed('./announcements.json'),
    ]);

    let dlCourses = [];
    let annCourses = [];

    if (dlRes.status === 'fulfilled') {
      const data = dlRes.value || {};
      dlCourses = Array.isArray(data.courses) ? data.courses : [];
      const rawDeadlines = Array.isArray(data.deadlines) ? data.deadlines : [];
      const parsedDeadlines = [];
      for (const item of rawDeadlines) {
        const dueMs = Date.parse(item.due_iso);
        if (Number.isNaN(dueMs)) continue;
        parsedDeadlines.push({
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
      state.deadlines = parsedDeadlines;
      state.deadlinesGeneratedAt = data.generated_at || null;
      state.deadlinesRetentionDays = Number(data.past_due_retention_days) || 5;
      state.deadlinesError = null;
    } else {
      state.deadlinesError =
        (dlRes.reason && dlRes.reason.message) || 'Could not fetch deadlines.json';
    }

    if (annRes.status === 'fulfilled') {
      const data = annRes.value || {};
      annCourses = Array.isArray(data.courses) ? data.courses : [];
      const rawAnns = Array.isArray(data.announcements) ? data.announcements : [];
      const parsedAnns = [];
      for (const item of rawAnns) {
        const parsedMs = item.posted_iso ? Date.parse(item.posted_iso) : NaN;
        parsedAnns.push({
          id: String(item.id || `${item.course_slug}-${item.title}-${item.posted_iso || ''}`),
          title: String(item.title || 'Course Announcement'),
          body: String(item.body || ''),
          course_slug: String(item.course_slug || 'course'),
          course_code: String(item.course_code || 'COURSE'),
          course_short_name: String(item.course_short_name || item.course_full_name || 'Course'),
          course_full_name: String(item.course_full_name || item.course_short_name || 'Course'),
          doctor: String(item.doctor || ''),
          posted_iso: String(item.posted_iso || ''),
          postedMs: Number.isNaN(parsedMs) ? NaN : parsedMs,
          accent_index: Number.isFinite(Number(item.accent_index)) ? Number(item.accent_index) : 0,
          links: Array.isArray(item.links) ? item.links : [],
          attachments: Array.isArray(item.attachments) ? item.attachments : [],
        });
      }
      state.announcements = parsedAnns;
      state.announcementsGeneratedAt = data.generated_at || null;
      state.announcementsError = null;
    } else {
      state.announcementsError =
        (annRes.reason && annRes.reason.message) || 'Could not fetch announcements.json';
    }

    state.courses = mergeCourses(dlCourses, annCourses);
    els.loadingState.classList.add('is-hidden');
    renderAll();
  }

  /* ------------------------------------------------------------------------
     Event Wiring
     ------------------------------------------------------------------------ */
  function bindEvents() {
    // Title Pull-Down Switcher
    els.btnViewMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      setViewMenuOpen(!state.viewMenuOpen);
    });

    els.viewMenuList.addEventListener('click', (e) => {
      const opt = e.target.closest('.title-dropdown-option');
      if (!opt) return;
      setActiveView(opt.dataset.view);
    });

    els.viewSwitcher.addEventListener('keydown', (e) => {
      const options = Array.from(els.viewMenuList.querySelectorAll('.title-dropdown-option'));
      if (e.key === 'Escape' && state.viewMenuOpen) {
        e.preventDefault();
        setViewMenuOpen(false);
        els.btnViewMenu.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!state.viewMenuOpen) {
          setViewMenuOpen(true);
          options[0]?.focus();
        } else {
          const idx = options.indexOf(document.activeElement);
          options[(idx + 1) % options.length]?.focus();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!state.viewMenuOpen) {
          setViewMenuOpen(true);
          options[options.length - 1]?.focus();
        } else {
          const idx = options.indexOf(document.activeElement);
          options[(idx - 1 + options.length) % options.length]?.focus();
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (state.viewMenuOpen && !els.viewSwitcher.contains(e.target)) {
        setViewMenuOpen(false);
      }
    });

    window.addEventListener('hashchange', () => {
      const next = parseViewFromHash();
      if (next !== state.activeView) {
        setActiveView(next, false);
      }
    });

    els.btnPastDue.addEventListener('click', () => {
      state.showPastDue = !state.showPastDue;
      els.btnPastDue.classList.toggle('is-active', state.showPastDue);
      els.btnPastDue.setAttribute('aria-pressed', String(state.showPastDue));
      renderAll();
    });

    els.btnTheme.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    els.btnExportAll.addEventListener('click', () => {
      const nowMs = Date.now();
      const query = state.searchQuery.trim().toLowerCase();
      const filteredUpcoming = getActiveWindowItems(nowMs)
        .filter((item) => {
          if (item.dueMs < nowMs) return false;
          if (state.selectedCourse && item.course_slug !== state.selectedCourse) return false;
          return matchesDeadlineSearch(item, query);
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
      state.searchQuery = '';
      els.searchInput.value = '';
      els.searchInput.focus();
      renderAll();
    });

    els.btnResetFilters.addEventListener('click', () => {
      state.selectedCourse = null;
      state.searchQuery = '';
      state.showPastDue = true;
      els.searchInput.value = '';
      els.btnPastDue.classList.add('is-active');
      els.btnPastDue.setAttribute('aria-pressed', 'true');
      renderAll();
    });

    els.btnRetry.addEventListener('click', () => {
      loadFeed();
    });

    // Course Filter Chip clicks (delegated)
    els.courseRack.addEventListener('click', (e) => {
      const chip = e.target.closest('.course-chip');
      if (!chip) return;
      const slug = chip.dataset.course || '';
      if (!slug || state.selectedCourse === slug) {
        state.selectedCourse = null;
      } else {
        state.selectedCourse = slug;
      }
      renderAll();
    });

    // Clicking an announcement card opens it in the foreground modal
    els.announcementsGrid.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const card = e.target.closest('.announcement-card');
      if (!card) return;
      openAnnouncementModal(card.dataset.announcementId, card);
    });

    els.announcementsGrid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest('a')) return;
      const card = e.target.closest('.announcement-card');
      if (!card) return;
      e.preventDefault();
      openAnnouncementModal(card.dataset.announcementId, card);
    });

    els.btnCloseModal.addEventListener('click', () => {
      closeAnnouncementModal();
    });

    els.annModal.addEventListener('click', (e) => {
      if (e.target === els.annModal) {
        closeAnnouncementModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.openAnnouncementId) {
        e.preventDefault();
        closeAnnouncementModal();
      }
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (state.activeView !== 'announcements') return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measureTruncatedAnnouncements, 120);
    });

    // Lightweight pointer-tracking specular sheen
    document.getElementById('board-main').addEventListener('pointermove', (e) => {
      const card = e.target.closest('.deadline-card, .announcement-card');
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
    state.activeView = parseViewFromHash();
    syncViewChrome();
    bindEvents();
    loadFeed();
    setInterval(tickCountdowns, 1000);
  }

  init();
})();
