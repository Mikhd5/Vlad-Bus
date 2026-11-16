# Mobile usability update

This build includes a dedicated mobile refinement pass for the public website and CRM.

## Public website
- Responsive navigation with expanded-state accessibility and automatic close after selecting a section.
- Single-column booking form on narrow screens, 48px+ controls and 16px input text to avoid iOS Safari auto-zoom.
- Larger readable text for section descriptions, transport details, benefits, consent and form feedback.
- Safe-area spacing for the floating WhatsApp button and sticky header.
- Two-column country cards on compact phones, with wrapping for long country names.
- Reduced-motion support and horizontal overflow prevention.
- Booking still opens WhatsApp with the prepared request; it does not submit to a backend.

## CRM
- Mobile login layout and larger login controls.
- Drawer navigation with backdrop, close-on-selection, outside tap and Escape key support.
- Two-column dashboard statistics, one-column dashboard panels and touch-sized actions.
- Horizontally scrollable data tables so wide datasets remain readable without squeezing every column.
- Bottom-sheet style edit dialogs with full-width fields and safe-area padding.
- Larger form controls, labels, statuses and toast notifications.

## Verification performed
- `npm run check` passed for the site script, CRM script and API JavaScript files.
- HTML parsed; no duplicate IDs or missing local assets were found.
- Responsive breakpoints and mobile input/touch overrides are present in both stylesheets.
- Confirmed the public booking form uses WhatsApp and does not call the bookings API.

## Real-device QA still recommended
The project has not been physically tested on every iPhone/Android model. Before production, check at least 320px, 360px, 375px, 390px, 414px and 430px widths, plus iOS Safari and Android Chrome. Also test keyboard opening, date picker, WhatsApp handoff, CRM drawer, table horizontal scrolling and edit dialogs.
