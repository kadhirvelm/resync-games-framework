// Used to run tests against the test database -> make sure the password and DB match the ones in the .github/workflows/ci.yml file -> services:postgres:env

export const DATABASE_HOST_URL =
  "postgresql://postgres:test-database@localhost:5432/test?schema=public";
export const SHADOW_DATABASE_HOST_URL =
  "postgresql://postgres:test-database@localhost:5432/test-shadow?schema=public";
