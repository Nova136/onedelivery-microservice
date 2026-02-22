/**
 * User seed data. Plain passwords are hashed in the user seed runner (bcrypt).
 */
export const seedUsers = [
  { email: 'admin@onedelivery.demo', plainPassword: 'Admin123!', role: 'Admin' as const },
  { email: 'user@onedelivery.demo', plainPassword: 'User123!', role: 'User' as const },
];
