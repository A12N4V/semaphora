(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const fileInput = $('csv-file');
  const dropZone = $('drop-zone');
  const emailColumn = $('email-column');
  const analyzeButton = $('analyze-button');
  const results = $('results');
  let csvText = '';
  let report = null;
  let noticeTimer;

  const labels = {
    missing_email: ['Missing email', 'block'],
    invalid_email: ['Invalid email', 'block'],
    duplicate_email: ['Duplicate address', 'block'],
    suppressed: ['Suppressed', 'block'],
    missing_fields: ['Missing fields', 'review'],
  };

  function notify(message) {
    const box = $('notice');
    box.textContent = message;
    box.classList.add('show');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => box.classList.remove('show'), 3000);
  }

  function headersFromCsv(text) {
    const headers = [];
    let field = '', quoted = false;
    const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || '';
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (quoted && ch === '"' && firstLine[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { headers.push(field.trim()); field = ''; }
      else field += ch;
    }
    headers.push(field.trim());
    return headers.filter(Boolean);
  }

  async function loadFile(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { notify('Choose a CSV under 10 MB.'); return; }
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') { notify('Choose a CSV file.'); return; }
    try {
      csvText = await file.text();
      if (!csvText.trim()) throw new Error('This CSV is empty.');
      const headers = headersFromCsv(csvText);
      if (!headers.length) throw new Error('Add a header row before importing.');
      emailColumn.replaceChildren();
      const prompt = document.createElement('option');
      prompt.value = ''; prompt.textContent = 'Choose email column'; prompt.selected = true;
      emailColumn.append(prompt);
      headers.forEach((header) => {
        const option = document.createElement('option');
        option.value = header; option.textContent = header;
        emailColumn.append(option);
      });
      const guessed = headers.find((header) => /^(e-?mail(?:\s+address)?|primary\s+email|contact\s+email)$/i.test(header));
      if (guessed) emailColumn.value = guessed;
      $('file-title').textContent = file.name;
      $('file-detail').textContent = `${(file.size / 1024).toFixed(file.size < 1024 * 1024 ? 0 : 1)} KB · ${headers.length} columns`;
      $('audit-controls').hidden = false;
      analyzeButton.disabled = !emailColumn.value;
      results.hidden = true;
      report = null;
    } catch (error) {
      csvText = '';
      notify(error.message || 'Could not read the CSV.');
    } finally {
      fileInput.value = '';
    }
  }

  function metric(label, value, kind = '') {
    const card = document.createElement('article');
    card.className = `metric ${kind}`;
    const name = document.createElement('span'); name.className = 'metric-label'; name.textContent = label;
    const number = document.createElement('strong'); number.className = 'metric-value'; number.textContent = Number(value).toLocaleString();
    card.append(name, number);
    return card;
  }

  function renderFindings() {
    if (!report) return;
    const filter = $('issue-filter').value;
    const shown = report.findings.filter((finding) => filter === 'all' || finding.issues.some((issue) => labels[issue][1] === filter));
    const body = $('findings-body'); body.replaceChildren();
    shown.forEach((finding) => {
      const row = document.createElement('tr');
      const rowNumber = document.createElement('td'); rowNumber.textContent = finding.rowNumber;
      const name = document.createElement('td'); name.textContent = finding.name;
      const email = document.createElement('td'); email.textContent = finding.email;
      const issues = document.createElement('td');
      finding.issues.forEach((key) => {
        const tag = document.createElement('span');
        tag.className = `issue-tag ${labels[key][1]}`;
        tag.textContent = labels[key][0];
        if (key === 'missing_fields') tag.title = `Empty: ${finding.missingFields.join(', ')}`;
        issues.append(tag);
      });
      row.append(rowNumber, name, email, issues); body.append(row);
    });
    $('finding-count').textContent = `${shown.length.toLocaleString()} ${shown.length === 1 ? 'finding' : 'findings'}`;
    $('no-findings').hidden = shown.length > 0;
    $('no-findings').querySelector('strong').textContent = report.findings.length ? 'No findings match this filter' : 'No flagged rows';
  }

  function renderReport(nextReport) {
    report = nextReport;
    const metrics = nextReport.metrics;
    const grid = $('metric-grid'); grid.replaceChildren(
      metric('CONTACT ROWS', metrics.total),
      metric('UNIQUE EMAILS', metrics.uniqueEmails),
      metric('DUPLICATES', metrics.duplicateRows, metrics.duplicateRows ? 'warn' : 'good'),
      metric('INVALID / MISSING', metrics.invalidEmails + metrics.missingEmails, metrics.invalidEmails + metrics.missingEmails ? 'bad' : 'good'),
      metric('SUPPRESSED', metrics.suppressed, metrics.suppressed ? 'bad' : 'good'),
      metric('CLEAN EXPORT', metrics.clean, metrics.clean ? 'good' : 'warn'),
    );
    $('result-count').textContent = `${metrics.total.toLocaleString()} ROWS · EMAIL FIELD: ${nextReport.emailHeader.toLocaleUpperCase()}`;
    $('export-summary').textContent = `${metrics.clean.toLocaleString()} unique, valid, unsuppressed contacts ready.`;
    $('export-clean').disabled = metrics.clean === 0;
    $('export-findings').disabled = nextReport.findings.length === 0;
    results.hidden = false;
    renderFindings();
  }

  async function analyzeList() {
    if (!csvText || !emailColumn.value) return;
    analyzeButton.disabled = true;
    analyzeButton.innerHTML = 'Analyzing…';
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText, emailHeader: emailColumn.value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not analyze this CSV.');
      renderReport(result);
      $('results-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      notify(error.message || 'Local analysis failed.');
    } finally {
      analyzeButton.disabled = !emailColumn.value;
      analyzeButton.innerHTML = 'Analyze list <span aria-hidden="true">→</span>';
    }
  }

  function csvCell(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function downloadCsv(filename, headers, rows) {
    const data = [headers.map(csvCell).join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))].join('\r\n');
    const objectUrl = URL.createObjectURL(new Blob([`\uFEFF${data}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = objectUrl; link.download = filename; link.style.display = 'none';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }

  function exportFindings() {
    if (!report?.findings.length) return;
    const rows = report.findings.map((item) => ({
      row: item.rowNumber,
      contact: item.name,
      email: item.email,
      findings: item.issues.map((issue) => labels[issue][0]).join('; '),
      empty_fields: item.missingFields.join('; '),
    }));
    downloadCsv('semaphora-findings.csv', ['row', 'contact', 'email', 'findings', 'empty_fields'], rows);
  }

  $('choose-file').addEventListener('click', () => fileInput.click());
  $('change-file').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
  dropZone.addEventListener('click', (event) => { if (!event.target.closest('button')) fileInput.click(); });
  dropZone.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target === dropZone) { event.preventDefault(); fileInput.click(); }
  });
  for (const name of ['dragenter', 'dragover']) dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.add('dragover'); });
  for (const name of ['dragleave', 'drop']) dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.remove('dragover'); });
  dropZone.addEventListener('drop', (event) => loadFile(event.dataTransfer?.files?.[0]));
  emailColumn.addEventListener('change', () => { analyzeButton.disabled = !emailColumn.value; });
  analyzeButton.addEventListener('click', analyzeList);
  $('issue-filter').addEventListener('change', renderFindings);
  $('export-clean').addEventListener('click', () => {
    if (!report) return;
    downloadCsv('semaphora-clean-contacts.csv', report.headers, report.cleanRows);
  });
  $('export-findings').addEventListener('click', exportFindings);
})();
