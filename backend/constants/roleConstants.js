const HUB_DASHBOARD_ROLES = ['hub_manager', 'ops_coordinator'];
const REGIONAL_DASHBOARD_ROLES = ['coo', 'regional_manager'];
const HQ_DASHBOARD_ROLES = ['super_admin', 'director', 'general_manager'];
const ADMIN_ROLES = [
  ...HQ_DASHBOARD_ROLES,
  ...REGIONAL_DASHBOARD_ROLES,
  ...HUB_DASHBOARD_ROLES,
];
const STAFF_ROLES = [...ADMIN_ROLES, 'rider', 'merchant'];

const canAccessAllHubsByRole = (role) => HQ_DASHBOARD_ROLES.includes(role);
const canAccessAssignedHubsByRole = (role) => REGIONAL_DASHBOARD_ROLES.includes(role);
const canAccessSingleHubByRole = (role) => HUB_DASHBOARD_ROLES.includes(role);
const isAdminRole = (role) => ADMIN_ROLES.includes(role);

const getDashboardLevelForRole = (role) => {
  if (canAccessAllHubsByRole(role)) return 'hq';
  if (canAccessAssignedHubsByRole(role)) return 'regional';
  if (canAccessSingleHubByRole(role)) return 'hub';
  return null;
};

module.exports = {
  HUB_DASHBOARD_ROLES,
  REGIONAL_DASHBOARD_ROLES,
  HQ_DASHBOARD_ROLES,
  ADMIN_ROLES,
  STAFF_ROLES,
  canAccessAllHubsByRole,
  canAccessAssignedHubsByRole,
  canAccessSingleHubByRole,
  isAdminRole,
  getDashboardLevelForRole,
};
