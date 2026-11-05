(() => {
  'use strict';

  const grid = document.getElementById('calendarGrid');
  if (!grid || typeof window.getCalendarDaySnapshot !== 'function') return;

  const escapeHTML = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const money = value => `৳${(Number(value) || 0).toLocaleString('en-BD', {maximumFractionDigits: 2})}`;
  const text = (value, fallback = '—') => escapeHTML(value == null || value === '' ? fallback : value);
  const definition = (label, value) => `<div class="calendar-day-field"><dt>${label}</dt><dd>${text(value)}</dd></div>`;
  const section = (title, content) => `<section class="calendar-day-section"><h3>${title}</h3>${content}</section>`;
  const list = (items, render, emptyText) => items.length
    ? `<div class="calendar-day-list">${items.map(render).join('')}</div>`
    : `<p class="calendar-day-empty-note">${emptyText}</p>`;
  const rowsHTML = rows => rows.length
    ? `<div class="calendar-day-table-wrap"><table class="calendar-day-table"><thead><tr><th>Client</th><th>Site</th><th>Category</th><th>Work</th><th>Assigned by</th><th>Team</th></tr></thead><tbody>${rows.map(row => `<tr><td>${text(row.c)}</td><td>${text(row.s)}</td><td>${text(row.cat)}</td><td>${text(row.w)}</td><td>${text(row.ab)}</td><td>${text(row.t)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="calendar-day-empty-note">No activity rows recorded.</p>';

  let activeCell = null;
  let priorOverflow = '';
  let modal = null;

  function closeModal() {
    if (!modal) return;
    modal.remove();
    modal = null;
    document.body.style.overflow = priorOverflow;
    const returnTarget = activeCell && activeCell.isConnected ? activeCell : grid;
    returnTarget.focus();
    activeCell = null;
  }

  function openModal(cell) {
    const snapshot = window.getCalendarDaySnapshot(cell.dataset.date);
    if (!snapshot || modal) return;
    activeCell = cell;
    priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const report = snapshot.report;
    const finance = snapshot.finance;
    const hasFinance = Object.values(finance).some(items => items.length);
    const hasContent = !!report || hasFinance;
    const status = snapshot.dutyStatus;
    const reportContent = report
      ? `<dl class="calendar-day-fields">${definition('Shift', report.shift)}${definition('Start time', report.startTime)}${definition('End time', report.endTime)}${definition('OT hours', report.ot)}${definition('Name', report.name)}${definition('HR ID', report.hr)}${definition('Designation', report.desig)}${definition('Assigned by', report.assigned)}</dl>${section('Activity rows', rowsHTML(Array.isArray(report.rows) ? report.rows : []))}`
      : '<p class="calendar-day-empty-note">No report is recorded for this date.</p>';
    const moneyContent = [
      section('Appraisal / profile', list(finance.profiles, item => `<article class="calendar-day-entry"><b>${text(item.effectiveFrom)}</b><span>Salary ${money(item.monthlySalary)} · OT ${money(item.otRate)}/hour</span></article>`, 'No profile entry dated this day.')),
      section('Food allowance', list(finance.foodAllowances, item => `<article class="calendar-day-entry"><b>${money(item.amount)} · ${text(item.location, 'Location not set')}</b><span>${text(item.distanceKm, '—')} km · Ref: ${text(item.referenceNo, 'Not entered')} · ${text(item.status, 'pending')}</span><span>${text(item.remarks, '')}</span></article>`, 'No food allowance dated this day.')),
      section('Food expense', list(finance.foodExpenses, item => `<article class="calendar-day-entry"><b>${money(item.amount)} · ${text(item.location, 'Location not set')}</b><span>${text(item.details, 'No details')}</span><span>${text(item.remarks, '')}</span></article>`, 'No food expense dated this day.')),
      section('Journey', list(finance.journeys, item => `<article class="calendar-day-entry"><b>${text(item.from, '?')} → ${text(item.to, '?')}</b><span>${text(item.client, 'No client')} · ${text(item.distanceKm, '—')} km · ${text(item.purpose, 'No purpose')}</span><span>${text(item.transport, '')} ${text(item.remarks, '')}</span></article>`, 'No journey dated this day.'))
    ].join('');

    modal = document.createElement('div');
    modal.className = 'calendar-day-backdrop';
    modal.innerHTML = `<section class="calendar-day-dialog" role="dialog" aria-modal="true" aria-label="Calendar details for ${escapeHTML(snapshot.date)}" tabindex="-1">
      <header class="calendar-day-header"><div><p class="page-kicker">Calendar details</p><h2>${escapeHTML(snapshot.date)}</h2><span class="calendar-day-status">${escapeHTML(status)}</span></div><button type="button" class="btn btn-icon calendar-day-close" aria-label="Close day details">×</button></header>
      ${hasContent ? `${section('Report', reportContent)}${section('Money entries', moneyContent)}` : '<div class="calendar-day-empty"><h3>Nothing recorded</h3><p>No report or finance entries exist for this date.</p></div>'}
    </section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('.calendar-day-close')) closeModal();
    });
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        modal.querySelector('.calendar-day-close')?.focus();
      }
    });
    modal.querySelector('.calendar-day-close')?.focus();
  }

  grid.addEventListener('click', event => {
    const cell = event.target.closest('.cal-cell[data-date]');
    if (cell && grid.contains(cell)) openModal(cell);
  });
  grid.addEventListener('keydown', event => {
    const cell = event.target.closest('.cal-cell[data-date]');
    if (!cell || !grid.contains(cell) || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openModal(cell);
  });
})();
