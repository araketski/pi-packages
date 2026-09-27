export interface LibraryGeneratorSchema {
  name: string;
  packageVersion: string;
  strict?: boolean;
  linter?: 'none' | 'eslint' | 'oxlint';
  unitTestRunner?: 'none' | 'jest' | 'vitest';
  formatter?: 'none' | 'prettier' | 'oxfmt';
}
