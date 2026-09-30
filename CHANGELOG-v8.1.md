# Version 8.1 — Admin experience and persistence

- Removed Leads and Settings from the admin navigation and overview.
- Added a prominent manual payment approval action to every active unpaid order.
- Manual approval grants program access or creates the paid physiotherapy booking immediately.
- Moved physiotherapy session creation and editing into a responsive modal.
- Reworked payment notifications into a readable desktop panel and mobile sheet.
- Extended secure member sessions from eight hours to 30 days.
- Kept the three realistic transformation demo cards visible and clearly labeled as demonstrations.
- Added integration coverage for manual order approval and automatic access granting.

## Deployment note

Member accounts persist across Render deployments only when a persistent disk is mounted at `/var/data` and `DATA_DIR` is set to `/var/data`. The included `render.yaml` declares this configuration for Blueprint deployments.
