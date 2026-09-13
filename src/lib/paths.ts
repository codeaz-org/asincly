// One place for app URLs so notifications, emails and links agree.

export const teamPath = (orgSlug: string, teamSlug: string) => `/${orgSlug}/${teamSlug}`;

export const checkInFlowPath = (orgSlug: string, teamSlug: string) =>
  `${teamPath(orgSlug, teamSlug)}/check-in`;

export const checkInDetailPath = (orgSlug: string, teamSlug: string, checkInId: string) =>
  `${teamPath(orgSlug, teamSlug)}/c/${checkInId}`;

export const peoplePath = (orgSlug: string, teamSlug: string) =>
  `${teamPath(orgSlug, teamSlug)}/people`;

export const settingsPath = (orgSlug: string, teamSlug: string) =>
  `${teamPath(orgSlug, teamSlug)}/settings`;
