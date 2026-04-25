# Harbor Rentals — Boat Rental Booking System

A complete boat rental booking system. Public-facing availability + booking page, plus a full admin dashboard.

## Stack

- **Backend:** Node.js + Express
- **Database:** SQLite via `better-sqlite3` (no external DB needed)
- **Frontend:** Plain HTML/CSS/vanilla JS — no frameworks
- **Port:** 3460

## Getting Started

```bash
cd boat-rental
npm install
npm start
```

Then open:
- **Public site:** http://localhost:3460
- **Admin dashboard:** http://localhost:3460/admin.html

## Admin Access

- Password: `boatadmin123`
- Session persists in `sessionStorage` until you log out

## Boats (Seed Data)

| Boat | Rate | Capacity | Features |
|------|------|----------|---------|
| Sea Breeze (28ft center console) | $450/day | 8 guests | Fishing gear, Bluetooth speakers, Cooler, Shade canopy |
| Island Hopper (22ft bowrider) | $350/day | 6 guests | Wakeboard tower, Bluetooth speakers, Swim platform, Bimini top |

## API Endpoints

### Public
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/boats` | List all boats |
| GET | `/api/boats/:id` | Get single boat |
| GET | `/api/boats/:id/availability?month=YYYY-MM` | Availability map for a month |
| POST | `/api/bookings` | Create a booking (public) |

### Admin (requires `x-admin-password: boatadmin123` header)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/login` | Validate password |
| GET | `/api/admin/bookings` | List all bookings |
| POST | `/api/admin/bookings` | Manually add a booking |
| PUT | `/api/admin/bookings/:id` | Update booking |
| DELETE | `/api/admin/bookings/:id` | Delete booking |
| GET | `/api/admin/blocked-dates` | List blocked dates |
| POST | `/api/admin/blocked-dates` | Block dates |
| DELETE | `/api/admin/blocked-dates/:id` | Unblock dates |
| PUT | `/api/admin/boats/:id` | Update boat details |

## Availability Status

| Color | Meaning |
|-------|---------|
| Green | Available — can be booked |
| Yellow | Pending — booking request received |
| Red | Booked — confirmed reservation |
| Gray | Blocked — maintenance or personal use |

## Payment

Stripe integration is ready to wire up. The "Pay Now" button shows "Payment processing coming soon" — replace the `POST /api/bookings` response handler with a Stripe Payment Intent call to go live.

## Data Location

SQLite database: `data/boats.db` — created automatically on first run.

## Production Notes

- Change `ADMIN_PASSWORD` in `server.js` before going live
- Add HTTPS (via nginx proxy or Caddy)
- Consider adding email notifications on new bookings (nodemailer)
- Stripe integration: wire up in `server.js` with `stripe` npm package
