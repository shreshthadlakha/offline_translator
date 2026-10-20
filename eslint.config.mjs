import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    // Re-enabled (L-25): the codebase carries no explicit any.
    "@typescript-eslint/no-explicit-any": "error",
    // Re-enabled (L-25): the codebase is clean under both rules; leading
    // underscores mark deliberately unused parameters (base class
    // signatures, destructuring position).
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    
    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    // The app syncs external world events (storage reads, media queries,
    // worker notes, overlay open state) into state from effects on purpose:
    // there is no event-to-state mapping for these sources otherwise. The
    // new compiler rule flags every such deliberate sync.
    "react-hooks/set-state-in-effect": "off",
    // The translation cache is an external store read during render, keyed by
    // a version counter. The refs rule misreads this intentional pattern.
    "react-hooks/refs": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    
    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    
    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "public/**", "scripts/**", "src/fonts/**", "download/**", "tests/**", "mini-services/**"]
}];

export default eslintConfig;
