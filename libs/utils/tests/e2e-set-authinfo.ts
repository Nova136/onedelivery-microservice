export const setAuthInfo = (token: string, owner: string) => ({
  token: `${token}`,
  'Content-Type': 'application/json',
  owner: `${owner}`,
  apiversion: 1.0,
});
