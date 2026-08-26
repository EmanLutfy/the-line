import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Solidity project: its JS tooling and vendored libraries are not part
      // of the site, and linting them only produces noise.
      "contracts/**",
      // Stale build output kept around for manual deletion. Codemods and the
      // linter both walk it otherwise, which is where the phantom "65 files
      // modified" during the Next 16 upgrade came from.
      "_to_delete/**",
      "_backup_stale/**",
    ],
  },
];

export default eslintConfig;
