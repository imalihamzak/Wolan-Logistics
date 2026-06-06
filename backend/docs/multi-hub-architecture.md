# Wolan Multi-Hub Architecture

This document explains the implemented hub isolation, dashboard levels, and branch expansion process for joint review.

## 1. Hub Isolation

Every operational record that belongs to a branch carries a `hub_id`. The isolation helpers in `backend/utils/hubAccess.js` build the MongoDB filters used by orders, riders, merchants, settlements, reports, uploads, shipments, live map, notifications, and hub analytics.

Access model:

| Actor level | Roles | Data scope |
| --- | --- | --- |
| Hub Dashboard | `hub_manager`, `ops_coordinator` | One assigned `hub_id` only |
| Regional Dashboard | `coo`, `regional_manager` | `assigned_hub_ids` only |
| HQ Master Dashboard | `super_admin`, `director`, `general_manager` | All hubs |

Protection examples:

| Request | Result |
| --- | --- |
| `HUB_001` manager requests `HUB_002` orders | `403 Forbidden` |
| `HUB_001` manager tries to edit a `HUB_002` rider | `403 Forbidden` |
| `HUB_001` manager requests `HUB_002` COD settlement records | `403 Forbidden` |
| Regional user requests a hub outside `assigned_hub_ids` | `403 Forbidden` |
| HQ user requests any hub | Allowed |

Hub managers may see cross-hub macro comparison only. That macro payload contains hub labels, target-hit percentage, high-level totals, and graph-ready metrics. It does not contain customer names, phones, exact addresses, rider directories, order lists, COD record details, or branch drill-down links.

## 2. Dashboard Levels

Implemented dashboard routes:

| UI route | API route | Audience |
| --- | --- | --- |
| `/hub-dashboard` | `/api/v1/auth/dashboard/hub` | Hub Manager, Operations Coordinator |
| `/regional-dashboard` | `/api/v1/auth/dashboard/regional` | COO, Regional Manager |
| `/hq-dashboard` | `/api/v1/auth/dashboard/hq` | Director, General Manager, Super Admin |
| `/dashboard` | `/api/v1/auth/dashboard/admin` | Auto-selects the actor's allowed level |

The sidebar routes users to their correct dashboard level automatically. The backend is still the source of truth, so manually opening the wrong dashboard URL returns `403 Forbidden`.

## 3. Role And Permission Hierarchy

| Role | Can create hubs | Can assign managers | Can see all hubs | Can see assigned hubs | Can see own hub |
| --- | --- | --- | --- | --- | --- |
| `super_admin` | Yes | Yes | Yes | Yes | Yes |
| `director` | Yes | Yes | Yes | Yes | Yes |
| `general_manager` | Yes | Yes | Yes | Yes | Yes |
| `coo` | No | No | No | Yes | Yes, if assigned |
| `regional_manager` | No | No | No | Yes | Yes, if assigned |
| `hub_manager` | No | No | No | No | Yes |
| `ops_coordinator` | No | No | No | No | Yes |

## 4. Future Branch Expansion Process

When Wolan opens a second branch:

1. HQ admin opens Hub Management and creates the new hub, for example `HUB_002 - Ntinda`.
2. HQ admin assigns a hub manager to `HUB_002`.
3. HQ admin assigns regional staff through `/api/v1/auth/users/:id/hub-scope` with `assigned_hub_ids`.
4. Riders, merchants, orders, uploads, settlements, and notifications created for that branch receive `hub_id = HUB_002`.
5. Hub-level users immediately become limited to their own `hub_id`.
6. Regional users see only hubs in `assigned_hub_ids`.
7. HQ users retain full visibility across all branches.

## 5. Review Demonstration Checklist

1. Login as HQ admin and open `/hq-dashboard`; confirm all hubs are visible.
2. Create or open `HUB_002` in Hub Management.
3. Assign one manager to `HUB_001` and one manager to `HUB_002`.
4. Login as the `HUB_001` manager and open `/hub-dashboard`; confirm only local operations are detailed.
5. Try to open a `HUB_002` order, rider, merchant, or COD record as `HUB_001`; confirm `403 Forbidden`.
6. Confirm the cross-hub section only shows macro comparison and has no clickable external hub drill-down.
7. Login as regional manager assigned to `HUB_001` and `HUB_002`; confirm only those assigned hubs are visible.
8. Login as HQ again; confirm HQ can still view all hubs.
