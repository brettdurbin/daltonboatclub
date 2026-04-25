/* ─────────────────────────────────────────────
   Harbor Rentals — Public Booking Page
   ───────────────────────────────────────────── */

const API = '';
let boats = [];
let calendarState = {
  boatId: null,
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1, // 1-indexed
  availability: {},
  selStart: null,
  selEnd: null,
};

// ── Toast ──────────────────────────────────────
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Modal ──────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('active');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// ── Format helpers ────────────────────────────
function fmt(date) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtMoney(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 });
}
function daysBetween(a, b) {
  const ms = new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00');
  return Math.round(ms / 86400000) + 1;
}

// ── Load boats ────────────────────────────────
async function loadBoats() {
  try {
    const res = await fetch(`${API}/api/boats`);
    boats = await res.json();
    renderBoats();
    setupCalendarTabs();
    populateBoatSelect();
  } catch (e) {
    console.error(e);
    toast('Could not load boats. Is the server running?', 'error');
  }
}

function renderBoats() {
  const grid = document.getElementById('boats-grid');
  grid.innerHTML = boats.map(boat => `
    <div class="boat-card">
      <img
        class="boat-img"
        src="${boat.imageUrl}"
        alt="${boat.name}"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
      >
      <div class="boat-img-placeholder" style="display:none">⛵</div>
      <div class="boat-body">
        <div class="boat-header">
          <div class="boat-name">${boat.name}</div>
          <div class="boat-price">
            <div class="price-amount">${fmtMoney(boat.dailyRate)}</div>
            <div class="price-label">/ day</div>
          </div>
        </div>
        <p class="boat-description">${boat.description}</p>
        <div class="boat-meta">
          <div class="boat-meta-item">👥 Up to ${boat.capacity} guests</div>
        </div>
        <div class="boat-features">
          ${boat.features.map(f => `<span class="feature-tag">${f}</span>`).join('')}
        </div>
        <div class="boat-actions">
          <button class="btn btn-primary" onclick="selectBoatAndScroll(${boat.id})">Book This Boat</button>
          <button class="btn btn-outline" onclick="selectCalendarBoat(${boat.id});document.getElementById('availability').scrollIntoView({behavior:'smooth'})">Check Availability</button>
        </div>
      </div>
    </div>
  `).join('');
}

function selectBoatAndScroll(id) {
  selectCalendarBoat(id);
  document.getElementById('availability').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('form-boat-id').value = id;
  updateBookingSummary();
}

function populateBoatSelect() {
  const sel = document.getElementById('form-boat-id');
  sel.innerHTML = boats.map(b => `<option value="${b.id}">${b.name} — ${fmtMoney(b.dailyRate)}/day</option>`).join('');
  sel.addEventListener('change', () => {
    selectCalendarBoat(Number(sel.value));
    updateBookingSummary();
  });
}

// ── Calendar ──────────────────────────────────
function setupCalendarTabs() {
  const nav = document.getElementById('cal-boat-tabs');
  nav.innerHTML = boats.map(b => `
    <button class="boat-tab ${b.id === boats[0]?.id ? 'active' : ''}" onclick="selectCalendarBoat(${b.id})" id="ctab-${b.id}">${b.name}</button>
  `).join('');

  // Setup headers
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const headers = document.getElementById('cal-headers');
  headers.innerHTML = days.map(d => `<div class="cal-header">${d}</div>`).join('');

  document.getElementById('cal-prev').addEventListener('click', () => {
    calendarState.month--;
    if (calendarState.month < 1) { calendarState.month = 12; calendarState.year--; }
    loadCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calendarState.month++;
    if (calendarState.month > 12) { calendarState.month = 1; calendarState.year++; }
    loadCalendar();
  });

  if (boats.length) selectCalendarBoat(boats[0].id);
}

function selectCalendarBoat(id) {
  calendarState.boatId = id;
  calendarState.selStart = null;
  calendarState.selEnd = null;
  document.querySelectorAll('.boat-tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById(`ctab-${id}`);
  if (tab) tab.classList.add('active');
  loadCalendar();
}

async function loadCalendar() {
  const { boatId, year, month } = calendarState;
  if (!boatId) return;

  const monthStr = `${year}-${String(month).padStart(2,'0')}`;
  document.getElementById('cal-month-label').textContent = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  try {
    const res = await fetch(`${API}/api/boats/${boatId}/availability?month=${monthStr}`);
    const data = await res.json();
    calendarState.availability = data.availability || {};
    renderCalendar();
  } catch (e) {
    console.error(e);
    toast('Could not load availability', 'error');
  }
}

function renderCalendar() {
  const { year, month, availability, selStart, selEnd } = calendarState;
  const daysEl = document.getElementById('cal-days');
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toISOString().slice(0,10);

  let html = '';

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cal-day empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const status = availability[ds] || 'available';
    const isPast = ds < today;

    let classes = ['cal-day'];
    if (isPast) classes.push('past');
    else classes.push(status);

    if (ds === today) classes.push('today');
    if (ds === selStart || ds === selEnd) classes.push('selected');
    else if (selStart && selEnd && ds > selStart && ds < selEnd) classes.push('in-range');

    const clickable = !isPast && status === 'available';
    const onclick = clickable ? `onDayClick('${ds}')` : '';

    html += `<div class="${classes.join(' ')}" ${onclick ? `onclick="${onclick}"` : ''} title="${ds}: ${status}">${d}</div>`;
  }

  daysEl.innerHTML = html;
}

function onDayClick(ds) {
  const { selStart, selEnd } = calendarState;

  if (!selStart || (selStart && selEnd)) {
    // Start fresh selection
    calendarState.selStart = ds;
    calendarState.selEnd = null;
  } else if (ds < selStart) {
    // Clicked before start — make it the new start
    calendarState.selStart = ds;
    calendarState.selEnd = null;
  } else {
    // Check all days in range are available
    const start = new Date(selStart + 'T00:00:00');
    const end = new Date(ds + 'T00:00:00');
    let cur = new Date(start);
    let blocked = false;
    while (cur <= end) {
      const d = cur.toISOString().slice(0,10);
      const status = calendarState.availability[d];
      if (status && status !== 'available') { blocked = true; break; }
      cur.setDate(cur.getDate() + 1);
    }
    if (blocked) {
      toast('Some dates in that range are unavailable. Please choose different dates.', 'error');
      calendarState.selStart = ds;
      calendarState.selEnd = null;
    } else {
      calendarState.selEnd = ds;
      // Sync to form
      document.getElementById('form-start-date').value = selStart;
      document.getElementById('form-end-date').value = ds;
      document.getElementById('form-boat-id').value = calendarState.boatId;
      updateBookingSummary();
      showDateRangeDisplay(selStart, ds);
    }
  }
  renderCalendar();
}

function showDateRangeDisplay(start, end) {
  const el = document.getElementById('date-range-display');
  const val = document.getElementById('date-range-value');
  el.classList.add('visible');
  const days = daysBetween(start, end);
  val.textContent = `${fmt(start)} → ${fmt(end)}  (${days} day${days !== 1 ? 's' : ''})`;
}

// ── Booking summary ───────────────────────────
function updateBookingSummary() {
  const boatId = Number(document.getElementById('form-boat-id').value);
  const start = document.getElementById('form-start-date').value;
  const end = document.getElementById('form-end-date').value;

  const boat = boats.find(b => b.id === boatId);
  const summary = document.getElementById('booking-summary');

  if (!boat || !start || !end || end < start) {
    summary.style.display = 'none';
    return;
  }

  const days = daysBetween(start, end);
  const total = days * boat.dailyRate;

  document.getElementById('sum-boat').textContent = boat.name;
  document.getElementById('sum-dates').textContent = `${fmt(start)} – ${fmt(end)}`;
  document.getElementById('sum-days').textContent = `${days} day${days !== 1 ? 's' : ''}`;
  document.getElementById('sum-rate').textContent = `${fmtMoney(boat.dailyRate)}/day`;
  document.getElementById('sum-total').textContent = fmtMoney(total);
  summary.style.display = 'block';
}

document.getElementById('form-start-date').addEventListener('change', updateBookingSummary);
document.getElementById('form-end-date').addEventListener('change', updateBookingSummary);

// ── Booking form submit ───────────────────────
document.getElementById('booking-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    boatId: Number(document.getElementById('form-boat-id').value),
    startDate: document.getElementById('form-start-date').value,
    endDate: document.getElementById('form-end-date').value,
    customerName: document.getElementById('form-name').value.trim(),
    customerEmail: document.getElementById('form-email').value.trim(),
    customerPhone: document.getElementById('form-phone').value.trim(),
    notes: document.getElementById('form-notes').value.trim(),
  };

  if (!payload.startDate || !payload.endDate) {
    toast('Please select start and end dates', 'error');
    return;
  }

  const btn = e.target.querySelector('.pay-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const res = await fetch(`${API}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      toast(data.error || 'Booking failed', 'error');
      return;
    }

    const boat = boats.find(b => b.id === payload.boatId);
    const days = daysBetween(payload.startDate, payload.endDate);

    document.getElementById('confirm-details').innerHTML = `
      <strong>Boat:</strong> ${boat?.name}<br>
      <strong>Dates:</strong> ${fmt(payload.startDate)} – ${fmt(payload.endDate)} (${days} days)<br>
      <strong>Name:</strong> ${payload.customerName}<br>
      <strong>Email:</strong> ${payload.customerEmail}<br>
      <strong>Total:</strong> ${fmtMoney(data.totalPrice)}<br>
      <strong>Status:</strong> Pending confirmation
    `;

    openModal('confirm-modal');
    e.target.reset();
    document.getElementById('booking-summary').style.display = 'none';
    document.getElementById('date-range-display').classList.remove('visible');
    calendarState.selStart = null;
    calendarState.selEnd = null;
    loadCalendar();

  } catch (err) {
    toast('Server error. Please try again.', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Pay Now<span class="pay-btn-sub">Payment processing coming soon — we\'ll confirm your reservation by email</span>';
  }
});

// ── Init ──────────────────────────────────────
loadBoats();
