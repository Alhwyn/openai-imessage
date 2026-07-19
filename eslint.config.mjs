import convexPlugin from "@convex-dev/eslint-plugin";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["convex/_generated/**", "dist/**", "eslint.config.mjs", "node_modules/**"],
  },
  ...tseslint.configs.recommendedTypeChecked,
  ...convexPlugin.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      curly: ["error", "multi"],
      indent: ["error", 2, { SwitchCase: 1 }],
      "import/first": "error",
      "import/no-duplicates": "error",
      "import/order": [
        "error",
        {
          alphabetize: { order: "asc", caseInsensitive: true },
          groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
          "newlines-between": "always",
        },
      ],
      "nonblock-statement-body-position": ["error", "beside"],
      "no-multiple-empty-lines": ["error", { max: 1 }],
      "no-trailing-spaces": "error",
    },
  },
  {
    files: ["src/**/index.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "VariableDeclaration, FunctionDeclaration, ClassDeclaration, TSInterfaceDeclaration, TSTypeAliasDeclaration, ExpressionStatement",
          message:
            "Source index files are barrels only. Move implementations and declarations into named modules.",
        },
        {
          selector: "ExportNamedDeclaration[source], ExportAllDeclaration",
          message:
            "Import barrel members first, then export them in a separate block.",
        },
      ],
    },
  },
);
