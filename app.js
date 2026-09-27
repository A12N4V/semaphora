(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const tabs = [
    { button: $('tab-list'), panel: $('panel-list') },
    { button: $('tab-compose'), panel: $('panel-compose') },
    { button: $('tab-log'), panel: $('panel-log') }
  ];
  const fileInput = $('csv-file');
  const mediaInput = $('media-files');
  const editor = $('template');
  const attachmentList = $('attachment-list');
  const grid = $('spreadsheet');
  let rows = [];
  let headers = ['Email', 'Name'];
  let selected = 0;
  let log = [];
  let editMode = true;
  let attachments = [];
  let attachmentId = 0;
  const recordIds = new WeakMap();
  let nextRecordId = 0;
  let savedRange = null;
  let toastTimer;

  function blankRecord() { return Object.fromEntries(headers.map((header) => [header, ''])); }
  function activeRows() { return rows.filter((record) => headers.some((header) => String(record[header] ?? '').trim())); }
  function rowId(record) {
    if (!recordIds.has(record)) recordIds.set(record, ++nextRecordId);
    return recordIds.get(record);
  }

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
  const allowedTags = new Set(['A', 'B', 'BLOCKQUOTE', 'BR', 'DIV', 'EM', 'H1', 'H2', 'H3', 'HR', 'I', 'LI', 'OL', 'P', 'S', 'STRONG', 'U', 'UL', 'IMG']);
  function cleanMarkup(source) {
    const parsed = new DOMParser().parseFromString(`<body>${source}</body>`, 'text/html');
    function clean(parent) {
      Array.from(parent.children).forEach((node) => {
        const tag = node.tagName;
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'MATH', 'VIDEO', 'AUDIO'].includes(tag)) { node.remove(); return; }
        clean(node);
        if (!allowedTags.has(tag)) { node.replaceWith(...node.childNodes); return; }
        const href = tag === 'A' ? node.getAttribute('href') : '';
        const src = tag === 'IMG' ? node.getAttribute('src') : '';
        const alt = tag === 'IMG' ? node.getAttribute('alt') : '';
        const inlineImage = tag === 'IMG' ? node.getAttribute('data-inline-image') : '';
        Array.from(node.attributes).forEach((attribute) => node.removeAttribute(attribute.name));
        if (tag === 'A' && href && /^(https?:|mailto:)/i.test(href)) { node.setAttribute('href', href); node.setAttribute('rel', 'noopener noreferrer'); }
        if (tag === 'IMG' && src && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) {
          node.setAttribute('src', src); node.setAttribute('alt', alt || '');
          if (inlineImage) node.setAttribute('data-inline-image', 'true');
        } else if (tag === 'IMG') node.remove();
      });
    }
    clean(parsed.body);
    return parsed.body.innerHTML;
  }
  function personalizedHtml(record) {
    const parsed = new DOMParser().parseFromString(`<body>${cleanMarkup(editor.innerHTML)}</body>`, 'text/html');
    const walker = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT);
    let textNode;
    while ((textNode = walker.nextNode())) textNode.nodeValue = personalized(textNode.nodeValue, record);
    return parsed.body.innerHTML;
  }
  function messageText() {
    const copy = editor.cloneNode(true);
    copy.querySelectorAll('img').forEach((image) => image.replaceWith(document.createTextNode(`[Image: ${image.alt || 'inline'}]`)));
    return (copy.innerText || copy.textContent || '').replace(/\u00a0/g, ' ').trim();
  }
  function editorHasRichContent() {
    return attachments.length > 0 || !!editor.querySelector('img,ul,ol,blockquote,b,strong,i,em,u,s,a,h1,h2,h3,hr');
  }
  function currentRange() {
    const selection = window.getSelection();
    return selection && selection.rangeCount && editor.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
  }
  function rememberRange() { savedRange = currentRange(); }
  function insertAtCursor(node) {
    editor.focus();
    const selection = window.getSelection();
    let range = savedRange;
    if (!range || !editor.contains(range.startContainer)) {
      range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
    }
    range.deleteContents(); range.insertNode(node); range.setStartAfter(node); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range); savedRange = range.cloneRange();
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  }
  function updateAttachments() {
    attachmentList.replaceChildren();
    attachmentList.hidden = attachments.length === 0;
    attachments.forEach((entry) => {
      const chip = document.createElement('div'); chip.className = 'attachment-chip';
      const name = document.createElement('span'); name.textContent = entry.file.name || 'attachment';
      const size = document.createElement('small'); size.textContent = formatSize(entry.file.size);
      const remove = document.createElement('button'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${entry.file.name}`); remove.textContent = '×';
      remove.addEventListener('click', () => { attachments = attachments.filter((item) => item.id !== entry.id); updateAttachments(); renderList(); });
      chip.append(name, size, remove); attachmentList.append(chip);
    });
    renderList();
  }
  function formatSize(size) {
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  const maxMediaBytes = 24 * 1024 * 1024;
  function acceptMedia(fileList) {
    const incoming = Array.from(fileList || []);
    const inlineSize = Array.from(editor.querySelectorAll('img[src^="data:image/"]')).reduce((sum, image) => sum + Math.floor((image.src.split(',')[1] || '').length * 0.75), 0);
    const currentSize = attachments.reduce((sum, item) => sum + item.file.size, 0) + inlineSize;
    let available = maxMediaBytes - currentSize;
    let accepted = 0;
    incoming.forEach((file) => {
      if (file.size > available) { toast('Attachments must stay under 24 MB total.'); return; }
      attachments.push({ id: ++attachmentId, file }); available -= file.size; accepted++;
    });
    updateAttachments();
    return accepted;
  }
  function readDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read pasted media.'));
      reader.readAsDataURL(file);
    });
  }
  async function insertInlineImage(file) {
    const currentSize = attachments.reduce((sum, item) => sum + item.file.size, 0) + Array.from(editor.querySelectorAll('img[src^="data:image/"]')).reduce((sum, image) => sum + Math.floor((image.src.split(',')[1] || '').length * 0.75), 0);
    if (file.size + currentSize > maxMediaBytes) { toast('Pasted media must stay under 24 MB total.'); return; }
    const dataUrl = await readDataUrl(file);
    const image = document.createElement('img');
    image.src = dataUrl; image.alt = file.name || 'Pasted image'; image.dataset.inlineImage = 'true';
    insertAtCursor(image); renderList();
  }
  function addAttachmentMarker(file) {
    const label = document.createElement('span'); label.className = 'inline-attachment';
    label.contentEditable = 'false'; label.textContent = `📎 ${file.name || 'attachment'}`;
    insertAtCursor(label);
    insertAtCursor(document.createTextNode(' '));
  }
  function bytesToBase64(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return btoa(binary).replace(/.{1,76}/g, '$&\r\n').trimEnd();
  }
  function utf8Base64(value) { return bytesToBase64(new TextEncoder().encode(value)); }
  function safeHeader(value) { return String(value || '').replace(/[\r\n]+/g, ' ').trim(); }
  function encodedHeader(value) { return value ? `=?UTF-8?B?${btoa(unescape(encodeURIComponent(value)))}?=` : ''; }
  function mimeType(file) { return /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(file.type) ? file.type : 'application/octet-stream'; }
  function encodedFilename(value) {
    return encodeURIComponent(value || 'attachment').replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  }
  function boundary(label) { return `----semaphora-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
  async function buildEml(address, subject, html) {
    const mixed = boundary('mixed');
    const inline = [];
    const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    Array.from(body.body.querySelectorAll('img[src^="data:image/"]')).forEach((image, index) => {
      const dataUrl = image.getAttribute('src');
      const match = dataUrl.match(/^data:(image\/[\w.+-]+);base64,([\s\S]+)$/i);
      if (!match) { image.remove(); return; }
      const id = `image-${index + 1}-${Date.now()}@semaphora`;
      image.setAttribute('src', `cid:${id}`);
      inline.push({ id, type: match[1], base64: match[2].replace(/\s/g, ''), name: `inline-${index + 1}.${match[1].split('/')[1].replace('jpeg', 'jpg')}` });
    });
    const parts = [`To: ${safeHeader(address)}`, `Subject: ${encodedHeader(safeHeader(subject))}`, 'X-Unsent: 1', 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${mixed}"`, '', `--${mixed}`, 'Content-Type: multipart/related; boundary="related"', '', '--related', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', utf8Base64(body.body.innerHTML)];
    for (const image of inline) parts.push(`--related`, `Content-Type: ${image.type}`, 'Content-Transfer-Encoding: base64', `Content-ID: <${image.id}>`, `Content-Disposition: inline; filename="${image.name}"`, '', image.base64.match(/.{1,76}/g)?.join('\r\n') || '');
    parts.push('--related--');
    for (const entry of attachments) {
      const bytes = new Uint8Array(await entry.file.arrayBuffer());
      const fallbackName = safeHeader(entry.file.name).replace(/["\\]/g, '_').replace(/[^\x20-\x7E]/g, '_') || 'attachment';
      parts.push(`--${mixed}`, `Content-Type: ${mimeType(entry.file)}; name="${fallbackName}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedFilename(entry.file.name)}`, '', bytesToBase64(bytes));
    }
    parts.push(`--${mixed}--`, '');
    return parts.join('\r\n');
  }
  function saveEml(data) {
    const blob = new Blob([data], { type: 'message/rfc822' });
    const link = document.createElement('a');
    const suffix = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = URL.createObjectURL(blob); link.download = `semaphora-${suffix}.eml`; link.style.display = 'none';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 30000);
  }
  function setRecipient(index) {
    const recipients = activeRows();
    if (!recipients.length) return;
    selected = (index + recipients.length) % recipients.length;
    renderList();
  }

  function renderList() {
    const recipients = activeRows();
    const hasRows = recipients.length > 0;
    $('spreadsheet-panel').hidden = !editMode;
    $('table-toggle').textContent = editMode ? 'View list' : 'Edit CSV';
    $('table-toggle').disabled = !hasRows;
    $('list-layout').hidden = !hasRows || editMode;
    $('empty-list').hidden = hasRows || editMode;
    $('drop-hint').hidden = hasRows || editMode;
    $('recipient-picker').hidden = !hasRows || editMode;
    $('recipient-picker-label').hidden = !hasRows || editMode;
    $('list-count').textContent = recipients.length;
    $('list-subtitle').textContent = hasRows ? `${recipients.length} recipient${recipients.length === 1 ? '' : 's'}` : 'Add recipients or import a CSV.';
    if (!hasRows || editMode) return;
    selected = Math.min(selected, recipients.length - 1);

    const list = $('recipient-list');
    list.replaceChildren();
    const picker = $('recipient-picker');
    picker.replaceChildren();
    recipients.forEach((record, index) => {
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
      const sent = log.some((entry) => entry.rowId === rowId(record));
      const state = document.createElement('button');
      state.type = 'button'; state.className = 'recipient-send';
      state.setAttribute('aria-label', sent ? 'Draft already prepared' : (editorHasRichContent() ? 'Save draft file with media' : 'Open draft in mail app'));
      state.innerHTML = sent ? '<svg class="tiny-check" viewBox="0 0 20 20"><path d="m4 10 4 4 8-9"/></svg>' : '<svg viewBox="0 0 20 20"><path d="m3 9 14-6-5 14-2-6-7-2Z"/></svg>';
      state.disabled = sent || !emailKey() || !String(emailKey() ? record[emailKey()] : '').trim();
      state.addEventListener('click', (event) => { event.stopPropagation(); setRecipient(index); openDraft().catch(() => toast('Could not prepare this draft.')); });
      outer.append(details, state);
      list.append(outer);
    });

    const record = recipients[selected];
    $('recipient-picker').value = String(selected);
    const logEntry = log.find((entry) => entry.rowId === rowId(record));
    const sent = !!logEntry;
    const address = emailKey() ? String(record[emailKey()] || '').trim() : '';
    $('selected-position').textContent = `${String(selected + 1).padStart(2, '0')} / ${String(recipients.length).padStart(2, '0')}`;
    $('selected-status').textContent = sent ? (logEntry.mode === 'eml' ? 'DRAFT SAVED' : 'DRAFT OPENED') : 'NOT OPENED';
    $('selected-status').classList.toggle('done', sent);
    $('selected-email').textContent = address || 'No email address';
    $('selected-subject').textContent = personalized($('subject').value, record) || '(no subject)';
    const preview = $('selected-message');
    const previewHtml = personalizedHtml(record);
    preview.innerHTML = previewHtml || 'Your personalized message will appear here.';
    $('prev-recipient').disabled = recipients.length < 2;
    $('next-recipient').disabled = recipients.length < 2;
    $('send-selected').disabled = sent || !address;
    $('send-selected').querySelector('span').textContent = sent ? 'Prepared' : (editorHasRichContent() ? 'Export .eml' : 'Open mail');
    $('send-selected').setAttribute('aria-label', sent ? 'Draft prepared' : (editorHasRichContent() ? 'Export email draft with media' : 'Open draft in mail app'));
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
        insertAtCursor(document.createTextNode(chip.textContent));
      });
      box.append(chip);
    });
  }
  function renderLog() {
    $('log-count').textContent = log.length;
    $('log-subtitle').textContent = log.length ? `${log.length} draft${log.length === 1 ? '' : 's'} prepared` : 'No drafts yet.';
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
  function renderGrid() {
    const head = document.createElement('thead');
    const headRow = head.insertRow();
    const rowHeading = document.createElement('th'); rowHeading.textContent = '#'; headRow.append(rowHeading);
    headers.forEach((header, column) => {
      const th = document.createElement('th');
      const input = document.createElement('input'); input.className = 'header-cell'; input.value = header; input.dataset.gridHeader = column; input.setAttribute('aria-label', `Column ${column + 1} name`);
      const heading = document.createElement('div'); heading.className = 'column-heading'; heading.append(input);
      if (headers.length > 1) {
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'column-remove'; remove.textContent = '×'; remove.title = `Remove ${header} column`; remove.dataset.removeColumn = column;
        heading.append(remove);
      }
      th.append(heading);
      headRow.append(th);
    });
    const actionHead = document.createElement('th'); actionHead.setAttribute('aria-label', 'Row actions'); headRow.append(actionHead);
    const body = document.createElement('tbody');
    const count = rows.length + 1;
    for (let rowIndex = 0; rowIndex < count; rowIndex++) {
      const draft = rowIndex === rows.length;
      const record = draft ? blankRecord() : rows[rowIndex];
      const tr = body.insertRow();
      const number = tr.insertCell(); number.className = 'row-number'; number.textContent = draft ? '＋' : String(rowIndex + 1);
      headers.forEach((header, column) => {
        const cell = tr.insertCell();
        const input = document.createElement('input'); input.className = 'grid-cell'; input.value = String(record[header] ?? ''); input.dataset.gridRow = rowIndex; input.dataset.gridCol = column;
        input.setAttribute('aria-label', `Row ${rowIndex + 1}, ${header}`);
        if (draft) input.placeholder = 'Add value';
        cell.append(input);
      });
      const actions = tr.insertCell();
      if (!draft) {
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'row-remove'; remove.textContent = '×'; remove.title = `Remove row ${rowIndex + 1}`; remove.setAttribute('aria-label', `Remove row ${rowIndex + 1}`); remove.dataset.removeRow = rowIndex;
        actions.append(remove);
      }
    }
    grid.replaceChildren(head, body);
  }
  function focusGridCell(row, column) {
    const target = grid.querySelector(`.grid-cell[data-grid-row="${row}"][data-grid-col="${column}"]`);
    if (target) { target.focus(); target.select(); }
  }
  function addGridRow(focus = true) {
    rows.push(blankRecord());
    const index = rows.length - 1;
    renderGrid(); renderList();
    if (focus) focusGridCell(index, 0);
  }
  function newColumnName() {
    let suffix = headers.length + 1;
    let name = `Column ${suffix}`;
    while (headers.some((header) => header.toLowerCase() === name.toLowerCase())) name = `Column ${++suffix}`;
    return name;
  }
  function addGridColumn() {
    const name = newColumnName();
    headers.push(name); rows.forEach((record) => { record[name] = ''; });
    renderGrid(); renderFields(); renderList();
    const input = grid.querySelector(`.header-cell[data-grid-header="${headers.length - 1}"]`); if (input) { input.focus(); input.select(); }
  }
  function removeGridRow(index) {
    const removedRecord = rows[index];
    if (removedRecord) log = log.filter((entry) => entry.rowId !== rowId(removedRecord));
    rows.splice(index, 1);
    selected = Math.max(0, Math.min(selected, activeRows().length - 1));
    renderGrid(); renderList(); renderLog();
  }
  function removeGridColumn(index) {
    if (headers.length < 2) return;
    const [removed] = headers.splice(index, 1);
    rows.forEach((record) => { delete record[removed]; });
    renderGrid(); renderFields(); renderList();
  }
  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
  function downloadCsv() {
    const content = [headers.map(csvEscape).join(','), ...activeRows().map((record) => headers.map((header) => csvEscape(record[header])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'semaphora-recipients.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function handleGridKeydown(event) {
    const cell = event.target.closest('.grid-cell');
    if (!cell) return;
    const row = Number(cell.dataset.gridRow); const column = Number(cell.dataset.gridCol);
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'Enter') {
      event.preventDefault(); addGridRow(); return;
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && ['=', '+'].includes(event.key)) {
      event.preventDefault(); addGridColumn(); return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (row >= rows.length) { addGridRow(); return; }
      focusGridCell(row + 1, column);
      return;
    }
    if (event.key === 'Tab') {
      const backward = event.shiftKey;
      if (backward && row === 0 && column === 0) return;
      if (!backward && row === rows.length && column === headers.length - 1) {
        event.preventDefault(); addGridRow(); return;
      }
      event.preventDefault();
      if (backward) focusGridCell(column > 0 ? row : row - 1, column > 0 ? column - 1 : headers.length - 1);
      else focusGridCell(column < headers.length - 1 ? row : row + 1, column < headers.length - 1 ? column + 1 : 0);
    }
  }
  async function openDraft() {
    const recipients = activeRows();
    if (!recipients.length) return;
    const record = recipients[selected];
    const address = emailKey() ? String(record[emailKey()] || '').trim() : '';
    if (!address) { toast('This row has no email address.'); return; }
    if (log.some((entry) => entry.rowId === rowId(record))) { toast('This draft is already in the log.'); return; }
    const subject = personalized($('subject').value, record).replace(/[\r\n]+/g, ' ').trim();
    let mode = 'mailto';
    if (editorHasRichContent()) {
      const eml = await buildEml(address, subject, personalizedHtml(record));
      saveEml(eml); mode = 'eml';
    } else {
      const body = personalized(messageText(), record);
      const encodedAddress = encodeURIComponent(address).replace(/%40/gi, '@');
      const mailto = `mailto:${encodedAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      // A mailto handoff opens the system's configured mail app; the browser cannot verify delivery.
      const link = document.createElement('a'); link.href = mailto; link.style.display = 'none';
      document.body.append(link); link.click(); link.remove();
    }
    const date = new Date();
    log.push({ rowId: rowId(record), email: address, subject, mode, iso: date.toISOString(), time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    renderList(); renderLog();
    toast(mode === 'eml' ? 'Draft file saved. Open it in your mail app.' : 'Draft handed off to your mail app.');
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
        headers = parsed.headers; rows = parsed.rows; selected = 0; log = []; editMode = false;
        renderFields(); renderGrid(); renderList(); renderLog(); toast(`${rows.length} recipients loaded.`);
      } catch (error) { toast(error.message || 'Could not read this CSV.'); }
      fileInput.value = '';
    };
    reader.onerror = () => toast('Could not read this file.');
    reader.readAsText(file);
  }

  tabs.forEach(({ button }, index) => button.addEventListener('click', () => setTab(index)));
  fileInput.addEventListener('change', () => acceptFile(fileInput.files[0]));
  $('table-toggle').addEventListener('click', () => { editMode = !editMode; renderList(); });
  $('add-row').addEventListener('click', () => addGridRow());
  $('add-column').addEventListener('click', addGridColumn);
  $('download-csv').addEventListener('click', downloadCsv);
  $('attach-media').addEventListener('click', () => mediaInput.click());
  grid.addEventListener('paste', (event) => {
    const cell = event.target.closest('.grid-cell');
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!cell || !/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    const matrix = text.replace(/\r/g, '').split('\n');
    while (matrix.length && matrix[matrix.length - 1] === '') matrix.pop();
    const cells = matrix.map((line) => line.split('\t'));
    const startRow = Number(cell.dataset.gridRow); const startColumn = Number(cell.dataset.gridCol);
    const needed = startColumn + Math.max(...cells.map((row) => row.length));
    while (headers.length < needed) {
      const name = newColumnName(); headers.push(name); rows.forEach((record) => { record[name] = ''; });
    }
    while (rows.length < startRow + cells.length) rows.push(blankRecord());
    cells.forEach((line, rowOffset) => line.forEach((value, columnOffset) => { rows[startRow + rowOffset][headers[startColumn + columnOffset]] = value; }));
    renderGrid(); renderFields(); renderList();
    focusGridCell(startRow + cells.length - 1, Math.min(headers.length - 1, startColumn + Math.max(...cells.map((row) => row.length)) - 1));
  });
  grid.addEventListener('input', (event) => {
    const input = event.target.closest('.grid-cell');
    if (!input) return;
    const row = Number(input.dataset.gridRow);
    const column = Number(input.dataset.gridCol);
    if (row === rows.length && input.value.trim()) {
      const caret = input.selectionStart;
      rows.push(blankRecord()); rows[row][headers[column]] = input.value;
      renderGrid();
      const nextInput = grid.querySelector(`.grid-cell[data-grid-row="${row}"][data-grid-col="${column}"]`);
      if (nextInput) { nextInput.focus(); nextInput.setSelectionRange(caret, caret); }
      renderList(); return;
    }
    if (row < rows.length) rows[row][headers[column]] = input.value;
    renderList();
  });
  grid.addEventListener('change', (event) => {
    const input = event.target.closest('.header-cell');
    if (!input) return;
    const index = Number(input.dataset.gridHeader); const previous = headers[index]; const next = input.value.trim();
    if (!next || headers.some((header, i) => i !== index && header.toLowerCase() === next.toLowerCase())) {
      input.value = previous; toast('Column names must be unique and non-empty.'); return;
    }
    headers[index] = next;
    rows.forEach((record) => { record[next] = record[previous] ?? ''; delete record[previous]; });
    renderGrid(); renderFields(); renderList();
  });
  grid.addEventListener('click', (event) => {
    const removeRow = event.target.closest('[data-remove-row]');
    const removeColumn = event.target.closest('[data-remove-column]');
    if (removeRow) removeGridRow(Number(removeRow.dataset.removeRow));
    if (removeColumn) removeGridColumn(Number(removeColumn.dataset.removeColumn));
  });
  grid.addEventListener('keydown', handleGridKeydown);
  mediaInput.addEventListener('change', () => { acceptMedia(mediaInput.files); mediaInput.value = ''; });
  const toolbar = document.querySelector('.message-toolbar');
  toolbar.addEventListener('mousedown', (event) => { rememberRange(); if (event.target.closest('[data-command]')) event.preventDefault(); });
  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-command]');
    if (!button) return;
    editor.focus(); document.execCommand(button.dataset.command, false); renderList();
  });
  editor.addEventListener('keyup', rememberRange);
  editor.addEventListener('mouseup', rememberRange);
  editor.addEventListener('click', rememberRange);
  document.addEventListener('selectionchange', () => { if (document.activeElement === editor || editor.contains(document.activeElement)) rememberRange(); });
  editor.addEventListener('paste', async (event) => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    savedRange = currentRange();
    const clipboardFiles = Array.from(clipboard.items || []).filter((item) => item.kind === 'file').map((item) => item.getAsFile()).filter(Boolean);
    const files = clipboardFiles.length ? clipboardFiles : Array.from(clipboard.files || []);
    if (files.length) {
      event.preventDefault();
      for (const file of files) {
        if (/^image\/(png|jpeg|gif|webp)$/i.test(file.type)) await insertInlineImage(file);
        else if (acceptMedia([file])) addAttachmentMarker(file);
      }
      return;
    }
    const html = clipboard.getData('text/html');
    if (html) {
      event.preventDefault();
      const safe = cleanMarkup(html);
      const fragment = document.createRange().createContextualFragment(safe);
      editor.focus();
      let range = savedRange;
      if (!range || !editor.contains(range.startContainer)) { range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); }
      range.deleteContents();
      const last = fragment.lastChild;
      if (last) { range.insertNode(fragment); range.setStartAfter(last); range.collapse(true); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); savedRange = range.cloneRange(); }
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
      renderList();
    }
  });
  editor.addEventListener('dragover', (event) => { if (event.dataTransfer?.files.length) event.preventDefault(); });
  editor.addEventListener('drop', async (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    event.preventDefault();
    const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (range && editor.contains(range.startContainer)) savedRange = range.cloneRange();
    for (const file of files) {
      if (/^image\/(png|jpeg|gif|webp)$/i.test(file.type)) await insertInlineImage(file);
      else if (acceptMedia([file])) addAttachmentMarker(file);
    }
  });
  const drop = $('drop-hint');
  for (const name of ['dragenter', 'dragover']) drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add('dragover'); });
  for (const name of ['dragleave', 'drop']) drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove('dragover'); });
  drop.addEventListener('drop', (event) => acceptFile(event.dataTransfer.files[0]));
  $('prev-recipient').addEventListener('click', () => setRecipient(selected - 1));
  $('next-recipient').addEventListener('click', () => setRecipient(selected + 1));
  $('recipient-picker').addEventListener('change', (event) => setRecipient(Number(event.currentTarget.value)));
  $('send-selected').addEventListener('click', () => { openDraft().catch(() => toast('Could not prepare this draft.')); });
  $('subject').addEventListener('input', renderList);
  editor.addEventListener('input', () => { rememberRange(); renderList(); });
  $('save-template').addEventListener('click', () => { renderList(); toast('Message updated.'); });
  $('clear-log').addEventListener('click', () => { log = []; renderLog(); renderList(); });
  renderFields(); renderGrid(); renderList(); renderLog();
})();
