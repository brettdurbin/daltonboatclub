/* ─────────────────────────────────────────────
   Harbor Rentals — Admin Dashboard
   ───────────────────────────────────────────── */

const API = '';
let adminToken = null;
let boats = [];
let bookings = [];
let blockedDates = [];
let adminCalYear = new Date().getFullYear();
let adminCalMonth = new Date().getMonth() + 1;

// ── Toast / Modal ──────────────────────────────
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ── Auth helpers ───────────────────────────────
function authHeaders() {
  return { 'Content-Type': 'application/json', 'x-admin-password': adminToken };
}
function logout() {
  adminToken = null;
  sessionStorage.removeItem('adminToken');
  document.getElementById('admin-app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-password').value = '';
}

// ── Format helpers ─────────────────────────────
function fmt(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtMoney(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 }); }
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000) + 1;
}
function badgeHtml(status) {
  return `<span class="badge badge-${status}">${status}</span>`;
}

// ── Login ─────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = document.getElementById('login-password').value;
  try {
    const res = await fetch(`${API}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json();
    if (res.ok) {
      adminToken = data.token;
      sessionStorage.setItem('adminToken', adminToken);
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('admin-app').style.display = 'block';
      document.getElementById('login-error').style.display = 'none';
      initAdmin();
    } else {
      document.getElementById('login-error').style.display = 'block';
    }
  } catch (err) {
    toast('Server error', 'error');
  }
});

// Auto-login from session storage
window.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('adminToken');
  if (saved) {
    adminToken = saved;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-app').style.display = 'block';
    initAdmin();
  }
});

// ── Tab navigation ─────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  const tabs = { dashboard: 0, bookings: 1, calendar: 2, blocked: 3, boats: 4 };
  document.querySelectorAll('.nav-tab')[tabs[name]]?.classList.add('active');

  if (name === 'calendar') renderAdminCalendars();
  if (name === 'blocked') renderBlockedTable();
  if (name === 'boats') renderBoatEditors();
}

// ── Init ───────────────────────────────────────
async function initAdmin() {
  await Promise.all([loadBoats(), loadBookings(), loadBlocked()]);
  renderDashboard();
  populateFilters();
  setupAdminCal();
}

async function loadBoats() {
  const res = await fetch(`${API}/api/boats`);
  boats = await res.json();
}

async function loadBookings() {
  const res = await fetch(`${API}/api/admin/bookings`, { headers: authHeaders() });
  if (!res.ok) { logout(); return; }
  bookings = await res.json();
}

async function loadBlocked() {
  const res = await fetch(`${API}/api/admin/blocked-dates`, { headers: authHeaders() });
  blockedDates = await res.json();
}

// ── Dashboard ──────────────────────────────────
function renderDashboard() {
  const total = bookings.length;
  const pending = bookings.filter(b => b.status === 'pending').length;
  const confirmed = bookings.filter(b => b.status === 'confirmed').length;
  const revenue = bookings.filter(b => b.status !== 'cancelled').reduce((s, b) => s + b.totalPrice, 0);

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-confirmed').textContent = confirmed;
  document.getElementById('stat-revenue').textContent = fmtMoney(revenue);

  const tbody = document.getElementById('dashboard-tbody');
  const recent = [...bookings].slice(0, 10);
  tbody.innerHTML = recent.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--gray-500);padding:28px">No bookings yet</td></tr>' :
    recent.map(b => `
      <tr>
        <td><strong>${b.customerName}</strong><br><small style="color:var(--gray-500)">${b.customerEmail}</small></td>
        <td>${b.boatName}</td>
        <td>${fmt(b.startDate)} – ${fmt(b.endDate)}</td>
        <td><strong>${fmtMoney(b.totalPrice)}</strong></td>
        <td>${badgeHtml(b.status)}</td>
        <td><div class="action-btns">
          <button class="btn btn-outline btn-sm" onclick="openEditBookingModal(${b.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDelete('booking', ${b.id})">Del</button>
        </div></td>
      </tr>
    `).join('');
}

// ── Bookings Table ─────────────────────────────
function populateFilters() {
  const sel = document.getElementById('filter-boat');
  sel.innerHTML = '<option value="">All Boats</option>' +
    boats.map(b => `<option value="${b.id}">${b.name}</option>`).join('');

  const bmBoat = document.getElementById('bm-boat');
  bmBoat.innerHTML = boats.map(b => `<option value="${b.id}">${b.name}</option>`).join('');

  const blBoat = document.getElementById('bl-boat');
  blBoat.innerHTML = boats.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
}

function renderBookingsTable() {
  const statusF = document.getElementById('filter-status').value;
  const boatF = document.getElementById('filter-boat').value;
  const searchF = document.getElementById('filter-search').value.toLowerCase();

  let filtered = bookings.filter(b => {
    if (statusF && b.status !== statusF) return false;
    if (boatF && String(b.boatId) !== boatF) return false;
    if (searchF && !b.customerName.toLowerCase().includes(searchF) && !b.customerEmail.toLowerCase().includes(searchF)) return false;
    return true;
  });

  const tbody = document.getElementById('bookings-tbody');
  tbody.innerHTML = filtered.length === 0 ? '<tr><td colspan="9" style="text-align:center;color:var(--gray-500);padding:28px">No bookings found</td></tr>' :
    filtered.map(b => `
      <tr>
        <td>#${b.id}</td>
        <td><strong>${b.customerName}</strong><br><small style="color:var(--gray-500)">${b.customerEmail}${b.customerPhone ? '<br>' + b.customerPhone : ''}</small></td>
        <td>${b.boatName}</td>
        <td>${fmt(b.startDate)}<br><small style="color:var(--gray-500)">→ ${fmt(b.endDate)}</small></td>
        <td>${daysBetween(b.startDate, b.endDate)}</td>
        <td><strong>${fmtMoney(b.totalPrice)}</strong></td>
        <td>${badgeHtml(b.status)}</td>
        <td><small style="color:var(--gray-500)">${b.notes || '—'}</small></td>
        <td><div class="action-btns">
          <button class="btn btn-outline btn-sm" onclick="openEditBookingModal(${b.id})">Edit</button>
          <button class="btn btn-success btn-sm" onclick="quickStatus(${b.id}, 'confirmed')" title="Confirm">✓</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDelete('booking', ${b.id})">✕</button>
        </div></td>
      </tr>
    `).join('');
}

// ── Booking Modal ──────────────────────────────
function openAddBookingModal() {
  document.getElementById('booking-modal-title').textContent = 'Add Booking';
  document.getElementById('bm-id').value = '';
  document.getElementById('bm-name').value = '';
  document.getElementById('bm-email').value = '';
  document.getElementById('bm-phone').value = '';
  document.getElementById('bm-start').value = '';
  document.getElementById('bm-end').value = '';
  document.getElementById('bm-notes').value = '';
  document.getElementById('bm-status').value = 'confirmed';
  openModal('booking-modal');
}

function openEditBookingModal(id) {
  const b = bookings.find(x => x.id === id);
  if (!b) return;
  document.getElementById('booking-modal-title').textContent = `Edit Booking #${id}`;
  document.getElementById('bm-id').value = b.id;
  document.getElementById('bm-boat').value = b.boatId;
  document.getElementById('bm-name').value = b.customerName;
  document.getElementById('bm-email').value = b.customerEmail;
  document.getElementById('bm-phone').value = b.customerPhone || '';
  document.getElementById('bm-start').value = b.startDate;
  document.getElementById('bm-end').value = b.endDate;
  document.getElementById('bm-status').value = b.status;
  document.getElementById('bm-notes').value = b.notes || '';
  openModal('booking-modal');
}

async function saveBooking() {
  const id = document.getElementById('bm-id').value;
  const payload = {
    boatId: Number(document.getElementById('bm-boat').value),
    customerName: document.getElementById('bm-name').value.trim(),
    customerEmail: document.getElementById('bm-email').value.trim(),
    customerPhone: document.getElementById('bm-phone').value.trim(),
    startDate: document.getElementById('bm-start').value,
    endDate: document.getElementById('bm-end').value,
    status: document.getElementById('bm-status').value,
    notes: document.getElementById('bm-notes').value.trim(),
  };

  try {
    let res;
    if (id) {
      res = await fetch(`${API}/api/admin/bookings/${id}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${API}/api/admin/bookings`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(payload)
      });
    }
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Save failed', 'error'); return; }

    toast(id ? 'Booking updated' : 'Booking added', 'success');
    closeModal('booking-modal');
    await loadBookings();
    renderDashboard();
    renderBookingsTable();
  } catch (err) {
    toast('Server error', 'error');
  }
}

async function quickStatus(id, status) {
  try {
    const res = await fetch(`${API}/api/admin/bookings/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status })
    });
    if (!res.ok) { toast('Update failed', 'error'); return; }
    toast(`Booking #${id} marked ${status}`, 'success');
    await loadBookings();
    renderDashboard();
    renderBookingsTable();
  } catch (e) { toast('Error', 'error'); }
}

// ── Delete ─────────────────────────────────────
let pendingDelete = null;

function confirmDelete(type, id) {
  pendingDelete = { type, id };
  document.getElementById('delete-message').textContent =
    type === 'booking' ? `Delete booking #${id}? This cannot be undone.` : `Unblock these dates?`;
  document.getElementById('delete-confirm-btn').onclick = executePendingDelete;
  openModal('delete-modal');
}

async function executePendingDelete() {
  if (!pendingDelete) return;
  const { type, id } = pendingDelete;
  const url = type === 'booking' ? `${API}/api/admin/bookings/${id}` : `${API}/api/admin/blocked-dates/${id}`;

  try {
    const res = await fetch(url, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) { toast('Delete failed', 'error'); return; }
    toast('Deleted', 'success');
    closeModal('delete-modal');
    pendingDelete = null;
    if (type === 'booking') { await loadBookings(); renderDashboard(); renderBookingsTable(); }
    else { await loadBlocked(); renderBlockedTable(); }
  } catch (e) { toast('Error', 'error'); }
}

// ── Blocked Dates ──────────────────────────────
function openBlockModal() {
  document.getElementById('bl-start').value = '';
  document.getElementById('bl-end').value = '';
  document.getElementById('bl-reason').value = '';
  openModal('block-modal');
}

async function saveBlock() {
  const payload = {
    boatId: Number(document.getElementById('bl-boat').value),
    startDate: document.getElementById('bl-start').value,
    endDate: document.getElementById('bl-end').value,
    reason: document.getElementById('bl-reason').value.trim(),
  };
  if (!payload.startDate || !payload.endDate) { toast('Select start and end dates', 'error'); return; }

  try {
    const res = await fetch(`${API}/api/admin/blocked-dates`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Failed', 'error'); return; }
    toast('Dates blocked', 'success');
    closeModal('block-modal');
    await loadBlocked();
    renderBlockedTable();
  } catch (e) { toast('Error', 'error'); }
}

function renderBlockedTable() {
  const tbody = document.getElementById('blocked-tbody');
  tbody.innerHTML = blockedDates.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:var(--gray-500);padding:28px">No blocked dates</td></tr>' :
    blockedDates.map(bd => `
      <tr>
        <td>${bd.boatName}</td>
        <td>${fmt(bd.startDate)}</td>
        <td>${fmt(bd.endDate)}</td>
        <td>${bd.reason || '—'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="confirmDelete('block', ${bd.id})">Unblock</button></td>
      </tr>
    `).join('');
}

// ── Admin Calendar ─────────────────────────────
function setupAdminCal() {
  document.getElementById('admin-cal-prev').addEventListener('click', () => {
    adminCalMonth--;
    if (adminCalMonth < 1) { adminCalMonth = 12; adminCalYear--; }
    renderAdminCalendars();
  });
  document.getElementById('admin-cal-next').addEventListener('click', () => {
    adminCalMonth++;
    if (adminCalMonth > 12) { adminCalMonth = 1; adminCalYear++; }
    renderAdminCalendars();
  });
}

async function renderAdminCalendars() {
  const monthStr = `${adminCalYear}-${String(adminCalMonth).padStart(2,'0')}`;
  document.getElementById('admin-cal-label').textContent = new Date(adminCalYear, adminCalMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const grid = document.getElementById('admin-cal-grid');
  grid.innerHTML = '';

  for (const boat of boats) {
    try {
      const res = await fetch(`${API}/api/boats/${boat.id}/availability?month=${monthStr}`);
      const data = await res.json();
      grid.appendChild(buildAdminCal(boat, data.availability || {}));
    } catch (e) {
      console.error(e);
    }
  }
}

function buildAdminCal(boat, availability) {
  const card = document.createElement('div');
  card.className = 'cal-boat-card';

  const year = adminCalYear, month = adminCalMonth;
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toISOString().slice(0,10);
  const days = ['S','M','T','W','T','F','S'];

  let html = `<h4>${boat.name} <span style="font-weight:400;color:var(--gray-500);font-size:0.82rem">${fmtMoney(boat.dailyRate)}/day</span></h4>`;
  html += `<div class="calendar-grid">`;
  html += days.map(d => `<div class="cal-header">${d}</div>`).join('');
  html += '</div><div class="calendar-grid" style="margin-top:4px">';
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const status = availability[ds] || 'available';
    const isPast = ds < today;
    let cls = ['cal-day'];
    if (isPast) cls.push('past');
    else cls.push(status);
    if (ds === today) cls.push('today');

    // Find booking for tooltip
    const booking = bookings.find(b =>
      b.boatId === boat.id &&
      b.startDate <= ds && b.endDate >= ds &&
      b.status !== 'cancelled'
    );
    const title = booking ? `${ds}: ${booking.customerName} (${booking.status})` : `${ds}: ${status}`;

    html += `<div class="${cls.join(' ')}" title="${title}">${d}</div>`;
  }
  html += '</div>';
  card.innerHTML = html;
  return card;
}

// ── Boat Editors ───────────────────────────────
function renderBoatEditors() {
  const grid = document.getElementById('boats-edit-grid');
  grid.innerHTML = boats.map(b => `
    <div class="boat-edit-card">
      <img class="boat-preview-img" src="${b.imageUrl}" alt="${b.name}" onerror="this.style.display='none'">
      <h4>${b.name}</h4>
      <p style="font-size:0.88rem;color:var(--gray-500);margin-bottom:12px">${b.description}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;font-size:0.88rem">
        <div><strong>Daily Rate:</strong> ${fmtMoney(b.dailyRate)}</div>
        <div><strong>Capacity:</strong> ${b.capacity} guests</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
        ${b.features.map(f => `<span class="feature-tag">${f}</span>`).join('')}
      </div>
      <button class="btn btn-outline btn-sm" onclick="openBoatModal(${b.id})">Edit Boat Details</button>
    </div>
  `).join('');
}

function openBoatModal(id) {
  const b = boats.find(x => x.id === id);
  if (!b) return;
  document.getElementById('btm-id').value = b.id;
  document.getElementById('btm-name').value = b.name;
  document.getElementById('btm-desc').value = b.description;
  document.getElementById('btm-rate').value = b.dailyRate;
  document.getElementById('btm-capacity').value = b.capacity;
  document.getElementById('btm-image').value = b.imageUrl;
  document.getElementById('btm-features').value = b.features.join(', ');
  openModal('boat-modal');
}

async function saveBoat() {
  const id = document.getElementById('btm-id').value;
  const features = document.getElementById('btm-features').value.split(',').map(f => f.trim()).filter(Boolean);
  const payload = {
    name: document.getElementById('btm-name').value.trim(),
    description: document.getElementById('btm-desc').value.trim(),
    dailyRate: Number(document.getElementById('btm-rate').value),
    capacity: Number(document.getElementById('btm-capacity').value),
    imageUrl: document.getElementById('btm-image').value.trim(),
    features,
  };

  try {
    const res = await fetch(`${API}/api/admin/boats/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Save failed', 'error'); return; }
    toast('Boat updated', 'success');
    closeModal('boat-modal');
    await loadBoats();
    renderBoatEditors();
  } catch (e) { toast('Error', 'error'); }
}
