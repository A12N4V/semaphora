(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const tabs = [
    { button: $('tab-list'), panel: $('panel-list') },
    { button: $('tab-compose'), panel: $('panel-compose') },
    { button: $('tab-log'), panel: $('panel-log') }
  ];
  const fileInput = $('csv-file');
  let rows = [];
  let headers = [];
  let selected = 0;
  let log = [];
  let toastTimer;

  function toast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2400);
  }

  function setTab(index) {
    tabs.forEach(({ button, panel }, i) => {
      const active = i === index;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });
  }

  function parseCSV(text) {
    const matrix = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"' && !field) quoted = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); matrix.push(row); row = []; field = '';
      } else field += ch;
    }
    if (field || row.length) { row.push(field); matrix.push(row); }
    while (matrix.length && matrix[matrix.length - 1].every((cell) => !cell.trim())) matrix.pop();
    if (!matrix.length) throw new Error('CSV is empty.');
    const names = matrix[0].map((name, i) => (i === 0 ? name.replace(/^\uFEFF/, '') : name).trim());
    if (names.some((name) => !name)) throw new Error('Every column needs a header.');
    if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw new Error('Column names must be unique.');
    return { headers: names, rows: matrix.slice(1).filter((cells) => cells.some((cell) => cell.trim())).map((cells) => Object.fromEntries(names.map((name, i) => [name, cells[i] || '']))) };
  }

  function emailKey() { return headers.find((header) => /^(email|e-mail|email address)$/i.test(header)); }
  function firstValue(record, patterns) {
    const key = headers.find((header) => patterns.test(header));
    return key ? String(record[key] || '') : '';
  }
  function personalized(source, record) {
    return source.replace(/\(([^()]+)\)/g, (token, field) => {
      const key = headers.find((header) => header.toLowerCase() === field.trim().toLowerCase());
      return key ? String(record[key] ?? '') : token;
    });
  }
  function fullName(record) {
    const name = firstValue(record, /^(name|full name)$/i) || [firstValue(record, /^first[_ ]?name$/i), firstValue(record, /^last[_ ]?name$/i)].filter(Boolean).join(' ');
    return name || (emailKey() ? record[emailKey()] : 'Recipient');
  }
  function marker(isDone) {
    return `<span class="row-state ${isDone ? 'done' : ''}" aria-label="${isDone ? 'Draft opened' : 'Not opened'}">${isDone ? '<svg viewBox="0 0 20 20"><path d="m4 10 4 4 8-9"/></svg>' : '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6"/></svg>'}</span>`;
  }
  function setRecipient(index) {
    if (!rows.length) return;
    selected = (index + rows.length) % rows.length;
    renderList();
  }

  function renderList() {
    const hasRows = rows.length > 0;
    $('list-layout').hidden = !hasRows;
    $('empty-list').hidden = hasRows;
    $('drop-hint').hidden = hasRows;
    $('recipient-picker').hidden = !hasRows;
    $('recipient-picker-label').hidden = !hasRows;
    $('list-count').textContent = rows.length;
    $('list-subtitle').textContent = hasRows ? `${rows.length} recipient${rows.length === 1 ? '' : 's'}` : 'Import a CSV to begin.';
    if (!hasRows) return;

    const list = $('recipient-list');
    list.replaceChildren();
    const picker = $('recipient-picker');
    picker.replaceChildren();
    rows.forEach((record, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `${fullName(record)} · ${emailKey() ? record[emailKey()] : 'No email'}`;
      picker.append(option);
      const outer = document.createElement('div');
      outer.className = `recipient-row ${index === selected ? 'selected' : ''}`;
      outer.setAttribute('aria-current', index === selected ? 'true' : 'false');
      const initials = fullName(record).trim().slice(0, 1).toUpperCase() || '·';
      const details = document.createElement('button');
      details.type = 'button'; details.className = 'recipient-select';
      details.innerHTML = `<span class="recipient-avatar">${escapeText(initials)}</span><span class="recipient-meta"><strong>${escapeText(fullName(record))}</strong><small>${escapeText(emailKey() ? record[emailKey()] : 'No email field')}</small></span>`;
      details.addEventListener('click', () => setRecipient(index));
      const sent = log.some((entry) => entry.index === index);
      const state = document.createElement('button');
      state.type = 'button'; state.className = 'recipient-send';
      state.setAttribute('aria-label', sent ? 'Draft already opened' : 'Open draft in mail app');
      state.innerHTML = sent ? '<svg class="tiny-check" viewBox="0 0 20 20"><path d="m4 10 4 4 8-9"/></svg>' : '<svg viewBox="0 0 20 20"><path d="m3 9 14-6-5 14-2-6-7-2Z"/></svg>';
      state.disabled = sent || !emailKey() || !String(emailKey() ? record[emailKey()] : '').trim();
      state.addEventListener('click', (event) => { event.stopPropagation(); setRecipient(index); openDraft(); });
      outer.append(details, state);
      list.append(outer);
    });

    const record = rows[selected];
    $('recipient-picker').value = String(selected);
    const sent = log.some((entry) => entry.index === selected);
    const address = emailKey() ? String(record[emailKey()] || '').trim() : '';
    $('selected-position').textContent = `${String(selected + 1).padStart(2, '0')} / ${String(rows.length).padStart(2, '0')}`;
    $('selected-status').textContent = sent ? 'DRAFT OPENED' : 'NOT OPENED';
    $('selected-status').classList.toggle('done', sent);
    $('selected-email').textContent = address || 'No email address';
    $('selected-subject').textContent = personalized($('subject').value, record) || '(no subject)';
    $('selected-message').textContent = personalized($('template').value, record);
    $('prev-recipient').disabled = rows.length < 2;
    $('next-recipient').disabled = rows.length < 2;
    $('send-selected').disabled = sent || !address;
    $('send-selected').querySelector('span').textContent = sent ? 'Opened' : 'Open mail';
    $('send-selected').setAttribute('aria-label', sent ? 'Draft opened' : 'Open draft in mail app');
  }

  function escapeText(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }
  function renderFields() {
    const box = $('fields'); box.replaceChildren();
    headers.forEach((header) => {
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'field-chip'; chip.textContent = `(${header})`;
      chip.addEventListener('click', () => {
        const input = $('template');
        input.setRangeText(chip.textContent, input.selectionStart, input.selectionEnd, 'end');
        input.focus(); renderList();
      });
      box.append(chip);
    });
  }
  function renderLog() {
    $('log-count').textContent = log.length;
    $('log-subtitle').textContent = log.length ? `${log.length} draft${log.length === 1 ? '' : 's'} opened in mail app` : 'No drafts opened yet.';
    $('empty-log').hidden = log.length > 0;
    $('log-list').hidden = log.length === 0;
    $('clear-log').hidden = log.length === 0;
    const list = $('log-list'); list.replaceChildren();
    log.slice().reverse().forEach((entry) => {
      const row = document.createElement('div'); row.className = 'log-row';
      const check = document.createElement('span'); check.className = 'log-check';
      check.innerHTML = '<svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7"/></svg>';
      const who = document.createElement('span'); who.className = 'log-who'; who.textContent = entry.email;
      const subject = document.createElement('span'); subject.className = 'log-subject'; subject.textContent = entry.subject;
      const time = document.createElement('time'); time.className = 'log-time'; time.dateTime = entry.iso; time.textContent = entry.time;
      row.append(check, who, subject, time); list.append(row);
    });
  }
  function openDraft() {
    if (!rows.length) return;
    const record = rows[selected];
    const address = emailKey() ? String(record[emailKey()] || '').trim() : '';
    if (!address) { toast('This row has no email address.'); return; }
    if (log.some((entry) => entry.index === selected)) { toast('This draft is already in the log.'); return; }
    const subject = personalized($('subject').value, record).replace(/[\r\n]+/g, ' ').trim();
    const body = personalized($('template').value, record);
    const encodedAddress = encodeURIComponent(address).replace(/%40/gi, '@');
    const mailto = `mailto:${encodedAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    // A mailto handoff opens the system's configured mail app; the browser cannot verify delivery.
    const link = document.createElement('a'); link.href = mailto; link.style.display = 'none';
    document.body.append(link); link.click(); link.remove();
    const date = new Date();
    log.push({ index: selected, email: address, subject, iso: date.toISOString(), time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    renderList(); renderLog();
    toast('Draft handed off to your mail app.');
  }
  function acceptFile(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast('CSV must be under 10 MB.'); return; }
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') { toast('Choose a .csv file.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCSV(String(reader.result || ''));
        if (!parsed.rows.length) throw new Error('No rows found below the headers.');
        headers = parsed.headers; rows = parsed.rows; selected = 0; log = [];
        renderFields(); renderList(); renderLog(); toast(`${rows.length} recipients loaded.`);
      } catch (error) { toast(error.message || 'Could not read this CSV.'); }
      fileInput.value = '';
    };
    reader.onerror = () => toast('Could not read this file.');
    reader.readAsText(file);
  }

  tabs.forEach(({ button }, index) => button.addEventListener('click', () => setTab(index)));
  fileInput.addEventListener('change', () => acceptFile(fileInput.files[0]));
  const drop = $('drop-hint');
  for (const name of ['dragenter', 'dragover']) drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add('dragover'); });
  for (const name of ['dragleave', 'drop']) drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove('dragover'); });
  drop.addEventListener('drop', (event) => acceptFile(event.dataTransfer.files[0]));
  $('prev-recipient').addEventListener('click', () => setRecipient(selected - 1));
  $('next-recipient').addEventListener('click', () => setRecipient(selected + 1));
  $('recipient-picker').addEventListener('change', (event) => setRecipient(Number(event.currentTarget.value)));
  $('send-selected').addEventListener('click', openDraft);
  $('subject').addEventListener('input', renderList);
  $('template').addEventListener('input', renderList);
  $('save-template').addEventListener('click', () => { renderList(); toast('Message updated.'); });
  $('clear-log').addEventListener('click', () => { log = []; renderLog(); renderList(); });
  renderList(); renderLog();
})();
