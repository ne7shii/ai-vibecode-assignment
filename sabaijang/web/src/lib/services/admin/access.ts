// Back-office areas and the roles that may use them (DESIGN §2.2–2.3). GM always passes.
// Shared by the API routes (requireStaff) and the admin UI menu (hide items without permission).
import type { StaffRole } from '@/lib/auth';

export type AdminArea =
  | 'dashboard' | 'arrivals' | 'addons' | 'outbox' | 'reviews'
  | 'seasons' | 'promotions' | 'codes' | 'reports' | 'rooms';

export const AREA_ROLES: Record<AdminArea, StaffRole[]> = {
  dashboard: ['GM', 'SALES', 'FRONT', 'ROOMS'],
  arrivals: ['GM', 'FRONT'],
  addons: ['GM', 'FRONT'],
  outbox: ['GM', 'FRONT'],
  reviews: ['GM', 'FRONT'],
  seasons: ['GM', 'SALES'],
  promotions: ['GM', 'SALES'],
  codes: ['GM', 'SALES'],
  reports: ['GM', 'SALES'],
  rooms: ['GM', 'ROOMS'],
};

export const SALES_ROLES: StaffRole[] = ['SALES'];
export const FRONT_ROLES: StaffRole[] = ['FRONT'];
export const ROOMS_ROLES: StaffRole[] = ['ROOMS'];
export const ALL_STAFF: StaffRole[] = ['SALES', 'FRONT', 'ROOMS'];

export const canUse = (role: StaffRole | null | undefined, area: AdminArea) => !!role && (role === 'GM' || AREA_ROLES[area].includes(role));
