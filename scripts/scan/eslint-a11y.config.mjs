// Extra ESLint pass for the P15 static scan: jsx-a11y (all recommended rules,
// severity "warn") + react-hooks/exhaustive-deps and rules-of-hooks ("error").
//
// WHY THE PATTERNS ARE RELATIVE: ESLint 9 only lints files inside the config
// file's base path (its own directory). a11y-lint.sh therefore COPIES the
// project's src/ tree to /tmp/scan-tools/src and lints the copy from
// /tmp/scan-tools (where npm install eslint@9 @typescript-eslint/parser
// eslint-plugin-jsx-a11y eslint-plugin-react-hooks typescript was run — the
// plugins are NOT installed in the project). Line numbers are identical to
// the real files, and the log's paths are rewritten back to
// /home/z/my-project/src by the runner. Vendored shadcn third-party code
// (src/components/ui) is skipped via the ignores below.
//
// Run it: bash scripts/scan/a11y-lint.sh   (output: scripts/scan/logs/eslint-a11y.txt)

import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";

// "languageRules for the components": jsx-a11y only inspects DOM elements, so
// the app's custom components are mapped to the element each one really
// renders (shadcn/Radix/cmdk components forward to these elements).
const components = {
  // shadcn primitives the app uses (see src/components/ui/*)
  Button: "button",
  Input: "input",
  Textarea: "textarea",
  Label: "label",
  Switch: "button", // Radix Switch renders <button role="switch">
  Separator: "div",
  Progress: "div",
  Alert: "div",
  AlertTitle: "h5",
  AlertDescription: "div",
  // Radix Dialog / AlertDialog / Sheet / Popover / DropdownMenu
  Dialog: "div", DialogTrigger: "button", DialogContent: "div",
  DialogTitle: "h2", DialogDescription: "p", DialogClose: "button",
  DialogHeader: "div", DialogFooter: "div",
  AlertDialog: "div", AlertDialogTrigger: "button", AlertDialogContent: "div",
  AlertDialogTitle: "h2", AlertDialogDescription: "p",
  AlertDialogAction: "button", AlertDialogCancel: "button",
  AlertDialogHeader: "div", AlertDialogFooter: "div",
  Sheet: "div", SheetTrigger: "button", SheetContent: "div",
  SheetTitle: "h2", SheetDescription: "p", SheetClose: "button",
  SheetHeader: "div", SheetFooter: "div",
  Popover: "div", PopoverTrigger: "button", PopoverContent: "div",
  PopoverAnchor: "div", PopoverClose: "button",
  DropdownMenu: "div", DropdownMenuTrigger: "button", DropdownMenuContent: "div",
  DropdownMenuItem: "div", DropdownMenuLabel: "div", DropdownMenuSeparator: "div",
  DropdownMenuCheckboxItem: "div", DropdownMenuRadioItem: "div",
  DropdownMenuGroup: "div", DropdownMenuSub: "div", DropdownMenuSubTrigger: "button",
  DropdownMenuSubContent: "div", DropdownMenuShortcut: "div",
  // cmdk (used directly by src/components/translate/language-picker.tsx)
  Command: "div", CommandInput: "input", CommandItem: "button",
  CommandList: "div", CommandGroup: "div", CommandEmpty: "div",
  CommandSeparator: "div", CommandShortcut: "div", CommandDialog: "div",
};

// Every recommended jsx-a11y rule, demoted to "warn" (this pass is a bug
// scan, not a gate; each hit is hand-triaged afterwards).
const a11yWarnRules = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([rule]) => [rule, "warn"]),
);

export default [
  {
    // Vendored third-party shadcn/ui: out of scope by plan (reported once as
    // a pattern, not linted file by file).
    ignores: ["src/components/ui/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      "jsx-a11y": { components },
    },
    plugins: {
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks,
    },
    rules: {
      ...a11yWarnRules,
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
    },
  },
];
