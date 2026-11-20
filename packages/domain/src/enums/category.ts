export const Category = {
  ACCESS: 'ACCESS',
  NETWORK_VPN: 'NETWORK_VPN',
  HARDWARE: 'HARDWARE',
  SOFTWARE: 'SOFTWARE',
  EMAIL: 'EMAIL',
  OTHER: 'OTHER',
} as const;

export type Category = (typeof Category)[keyof typeof Category];
