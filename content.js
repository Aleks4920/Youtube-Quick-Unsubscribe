// YouTube Quick Unsubscribe
// Adds a one-click "Unsubscribe" button to each channel on youtube.com/feed/channels.
// The button runs YouTube's own steps for you: open menu -> Unsubscribe -> confirm.
(() => {
  'use strict';

  const BTN_CLASS = 'ytqu-btn';
  const isChannelsPage = () => location.pathname.startsWith('/feed/channels');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Wait until fn() returns something truthy, or give up after `timeout` ms.
  async function waitFor(fn, timeout = 3000, step = 50) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  const isShown = (el) => {
    if (!el || !el.isConnected) return false;
    if (el.hasAttribute('hidden')) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };

  // ---------- State of one channel row ----------

  function subRenderer(row) {
    return row.querySelector('ytd-subscribe-button-renderer');
  }

  function isSubscribed(row) {
    const r = subRenderer(row);
    if (!r) return false;
    if (r.hasAttribute('subscribed')) return true;
    const bell = r.querySelector('#notification-preference-button');
    if (bell && !bell.hasAttribute('invisible') && !bell.hasAttribute('hidden')) return true;
    const main = r.querySelector('#subscribe-button-shape button');
    return !!main && /^unsubscribe/i.test(main.getAttribute('aria-label') || '');
  }

  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function channelName(row) {
    const t =
      row.querySelector('#channel-title yt-formatted-string#text') ||
      row.querySelector('ytd-channel-name #text') ||
      row.querySelector('#channel-title');
    const line = (t?.textContent || '').split('\n').map((x) => x.trim()).find(Boolean);
    return line || '';
  }

  // ---------- YouTube popup helpers ----------
  // YouTube uses ONE shared menu and ONE shared dialog for all rows.
  // So we must make sure they are closed first, and that they show THIS channel.

  const shownDropdowns = () =>
    [...document.querySelectorAll('ytd-popup-container tp-yt-iron-dropdown')].filter(isShown);

  const shownDialogs = () =>
    [...document.querySelectorAll('ytd-popup-container yt-confirm-dialog-renderer')].filter((d) =>
      isShown(d.closest('tp-yt-paper-dialog') || d)
    );

  function dialogFor(name) {
    const n = norm(name);
    return shownDialogs().find((d) => !n || norm(d.textContent).includes(n));
  }

  function confirmButton(dialog) {
    // Check the selectors one by one: a selector list returns the first match in
    // page order, which would be the outer #confirm-button wrapper.
    for (const sel of ['#confirm-button button', '#confirm-button tp-yt-paper-button', '#confirm-button']) {
      const el = dialog.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function menuUnsubscribeItem() {
    for (const dd of shownDropdowns()) {
      const services = [...dd.querySelectorAll('ytd-menu-service-item-renderer, yt-list-item-view-model')];
      if (!services.length) continue;
      const byText = services.find((i) => /unsubscribe/i.test(i.textContent || ''));
      if (byText) return byText;
      // Other UI languages: in the bell menu, "Unsubscribe" is the last item.
      if (services.length >= 3) return services[services.length - 1];
    }
    return null;
  }

  function pressEscape() {
    const t = document.activeElement || document.body;
    for (const type of ['keydown', 'keyup']) {
      t.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, composed: true }));
    }
  }

  // Close any open menu or dialog, and wait until they are really gone.
  async function closePopups() {
    for (const d of shownDialogs()) {
      d.querySelector('#cancel-button button, #cancel-button')?.click();
    }
    if (shownDropdowns().length) pressEscape();
    if (await waitFor(() => !shownDropdowns().length && !shownDialogs().length, 1500)) return true;
    // Last try: click on the page background, which closes YouTube menus.
    document.querySelector('tp-yt-iron-overlay-backdrop')?.click();
    pressEscape();
    return !!(await waitFor(() => !shownDropdowns().length && !shownDialogs().length, 1000));
  }

  // ---------- The unsubscribe steps ----------

  async function unsubscribe(row) {
    const r = subRenderer(row);
    if (!r) throw new Error('No subscribe button found');
    const name = channelName(row);

    // Step 0: start from a clean state.
    await closePopups();

    let dialog = null;

    // Path A: the bell ("Subscribed ˅") menu -> "Unsubscribe".
    const bellWrap = r.querySelector('#notification-preference-button');
    const bellBtn = bellWrap?.querySelector('button');
    const bellVisible = bellBtn && !bellWrap.hasAttribute('invisible') && !bellWrap.hasAttribute('hidden');
    if (bellVisible) {
      for (let attempt = 0; attempt < 3 && !dialog; attempt++) {
        if (attempt) await closePopups();
        bellBtn.click();
        // If a stuck menu was open, this click may have closed it. Then click once more.
        let item = await waitFor(menuUnsubscribeItem, 1200);
        if (!item) {
          bellBtn.click();
          item = await waitFor(menuUnsubscribeItem, 1200);
        }
        if (!item) continue;
        await sleep(250); // Let YouTube fill the menu with this channel's data.
        item = menuUnsubscribeItem() || item;
        (item.querySelector('tp-yt-paper-item, button') || item).click();
        dialog = await waitFor(() => dialogFor(name), 2500);
        if (!dialog && !isSubscribed(row)) return; // Done with no dialog.
      }
    }

    // Path B: channels with a plain "Subscribed" button (no bell) open the dialog directly.
    if (!dialog) {
      const plain = r.querySelector('#subscribe-button-shape button, #subscribe-button button');
      if (plain && /unsubscribe|subscribed/i.test((plain.getAttribute('aria-label') || '') + plain.textContent)) {
        await closePopups();
        plain.click();
        dialog = await waitFor(() => dialogFor(name), 2500);
        if (!dialog && !isSubscribed(row)) return;
      }
    }

    if (!dialog) {
      const info = {
        name,
        bellVisible: !!bellVisible,
        menusOpen: shownDropdowns().length,
        dialogsOpen: shownDialogs().length,
        dialogText: norm(shownDialogs()[0]?.textContent).slice(0, 80),
      };
      throw new Error('Could not open the unsubscribe dialog ' + JSON.stringify(info));
    }

    // Step 3: confirm.
    const ok = confirmButton(dialog);
    if (!ok) throw new Error('No confirm button found');
    ok.click();

    // Step 4: wait until YouTube updates the row and closes the dialog.
    if (!(await waitFor(() => !isSubscribed(row), 5000))) throw new Error('YouTube did not finish the unsubscribe');
    await waitFor(() => !shownDialogs().length, 1500);
  }

  // Run one unsubscribe at a time, so fast clicks on many rows do not collide.
  let queue = Promise.resolve();
  function enqueue(job) {
    const run = queue.then(job, job);
    queue = run.catch(() => {});
    return run;
  }

  // Unsubscribe one row and update its button. Returns true on success.
  function runRow(row, btn) {
    btn.disabled = true;
    btn.textContent = 'Working…';
    return enqueue(async () => {
      if (!isSubscribed(row)) {
        btn.textContent = 'Unsubscribed';
        btn.classList.add('ytqu-done');
        return true;
      }
      document.documentElement.classList.add('ytqu-running');
      try {
        await unsubscribe(row);
        btn.textContent = 'Unsubscribed';
        btn.classList.add('ytqu-done');
        return true;
      } catch (err) {
        console.warn('[YT Quick Unsubscribe]', channelName(row), err);
        await closePopups();
        btn.disabled = false;
        btn.textContent = 'Retry';
        return false;
      } finally {
        await sleep(200);
        document.documentElement.classList.remove('ytqu-running');
      }
    });
  }

  function onClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const btn = ev.currentTarget;
    const row = btn.closest('ytd-channel-renderer');
    if (!row || btn.disabled) return;
    runRow(row, btn);
  }

  // ---------- "Unsubscribe from all" bar ----------

  const bulk = { running: false, stop: false, armed: false, armTimer: 0 };
  let bar = null;

  // YouTube keeps old pages in the DOM, hidden. Use only the visible ones.
  const visibleRows = () => [...document.querySelectorAll('ytd-channel-renderer')].filter((r) => r.offsetParent);
  const pendingRows = (skip) =>
    visibleRows().filter((r) => !skip.has(r) && isSubscribed(r) && r.querySelector('.' + BTN_CLASS + ':not(:disabled)'));

  function makeBar() {
    const el = document.createElement('div');
    el.className = 'ytqu-bar';
    el.innerHTML =
      '<button type="button" class="ytqu-all">Unsubscribe from all</button>' +
      '<button type="button" class="ytqu-stop" hidden>Stop</button>' +
      '<span class="ytqu-status"></span>';
    el.querySelector('.ytqu-all').addEventListener('click', onAllClick);
    el.querySelector('.ytqu-stop').addEventListener('click', () => {
      bulk.stop = true;
      setStatus('Stopping after this channel…');
    });
    return el;
  }

  function setStatus(t) {
    if (bar) bar.querySelector('.ytqu-status').textContent = t;
  }

  function placeBar() {
    if (!isChannelsPage()) {
      bar?.remove();
      return;
    }
    const firstRow = visibleRows()[0];
    if (!firstRow) return;
    bar = bar || makeBar();
    const list = firstRow.closest('ytd-section-list-renderer');
    const chips = list?.querySelector('chip-bar-view-model');
    if (chips && chips.offsetParent) {
      if (bar.previousElementSibling !== chips) chips.insertAdjacentElement('afterend', bar);
      bar.classList.remove('ytqu-floating');
    } else if (!bar.isConnected || !bar.classList.contains('ytqu-floating')) {
      bar.classList.add('ytqu-floating');
      document.body.appendChild(bar);
    }
  }

  function onAllClick() {
    const allBtn = bar.querySelector('.ytqu-all');
    if (bulk.running) return;
    const n = pendingRows(new Set()).length;
    if (!n) {
      setStatus('No subscribed channels found on this page.');
      return;
    }
    // Two-step confirm: first click arms, second click starts.
    if (!bulk.armed) {
      bulk.armed = true;
      allBtn.textContent = 'Click again to confirm';
      allBtn.classList.add('ytqu-armed');
      setStatus(n + ' channels loaded. More load while it runs. This cannot be undone in one click.');
      bulk.armTimer = setTimeout(disarm, 5000);
      return;
    }
    disarm();
    runAll();
  }

  function disarm() {
    clearTimeout(bulk.armTimer);
    bulk.armed = false;
    if (!bar) return;
    const allBtn = bar.querySelector('.ytqu-all');
    allBtn.textContent = 'Unsubscribe from all';
    allBtn.classList.remove('ytqu-armed');
    if (!bulk.running) setStatus('');
  }

  // Scroll to the bottom so YouTube loads more channels. True if new rows came in.
  async function loadMore() {
    const before = visibleRows().length;
    window.scrollTo(0, document.documentElement.scrollHeight);
    return !!(await waitFor(() => visibleRows().length > before, 4000, 200));
  }

  async function runAll() {
    const allBtn = bar.querySelector('.ytqu-all');
    const stopBtn = bar.querySelector('.ytqu-stop');
    bulk.running = true;
    bulk.stop = false;
    allBtn.disabled = true;
    stopBtn.hidden = false;

    const failed = new Set();
    let done = 0;
    let failsInRow = 0;
    const report = () => setStatus(`Unsubscribed ${done}` + (failed.size ? `, failed ${failed.size}` : '') + '…');

    try {
      while (!bulk.stop) {
        let rows = pendingRows(failed);
        if (!rows.length) {
          setStatus('Loading more channels…');
          if (!(await loadMore())) break;
          rows = pendingRows(failed);
          if (!rows.length) continue;
        }
        const row = rows[0];
        row.scrollIntoView({ block: 'center' });
        report();
        const ok = await runRow(row, row.querySelector('.' + BTN_CLASS));
        if (ok) {
          done++;
          failsInRow = 0;
        } else {
          failed.add(row);
          if (++failsInRow >= 5) {
            setStatus(`Paused: 5 failures in a row (YouTube may be slowing you down). Unsubscribed ${done}. Wait a minute, then click again.`);
            return;
          }
        }
        await sleep(ok ? 400 : 1500); // Be gentle with YouTube.
      }
      setStatus(
        (bulk.stop ? 'Stopped. ' : 'Finished. ') +
          `Unsubscribed ${done}` +
          (failed.size ? `, failed ${failed.size} (click Retry on those rows).` : '.')
      );
    } finally {
      bulk.running = false;
      allBtn.disabled = false;
      stopBtn.hidden = true;
    }
  }

  // ---------- Add and refresh buttons ----------

  function makeButton() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = BTN_CLASS;
    b.textContent = 'Unsubscribe';
    b.title = 'Unsubscribe in one click';
    b.addEventListener('click', onClick);
    return b;
  }

  function syncRow(row) {
    const holder = row.querySelector('#subscribe-button') || subRenderer(row)?.parentElement;
    if (!holder) return;
    let btn = holder.querySelector(':scope > .' + BTN_CLASS);
    const subscribed = isSubscribed(row);

    if (!btn) {
      if (!subscribed) return;
      btn = makeButton();
      holder.classList.add('ytqu-row');
      holder.appendChild(btn);
      return;
    }

    // Row was re-used by YouTube, or user subscribed again from YouTube's button.
    if (subscribed && btn.classList.contains('ytqu-done')) {
      btn.classList.remove('ytqu-done');
      btn.disabled = false;
      btn.textContent = 'Unsubscribe';
    } else if (!subscribed && !btn.disabled) {
      btn.remove();
    }
  }

  function scan() {
    placeBar();
    if (!isChannelsPage()) return;
    document.querySelectorAll('ytd-channel-renderer').forEach(syncRow);
  }

  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      scan();
    });
  };

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['invisible', 'hidden', 'subscribed', 'aria-label'],
  });
  window.addEventListener('yt-navigate-finish', schedule);
  scan();
})();
