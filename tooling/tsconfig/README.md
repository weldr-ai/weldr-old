# @sada/tsconfig

Shared TypeScript configuration presets for the Sada monorepo.

## 🎯 Purpose

This package provides standardized TypeScript configurations to ensure consistent type checking across all packages and applications in the monorepo.

## 📦 Available Configurations

### `base.json`

Base TypeScript configuration with strict settings. Suitable for most packages.

```json
{
  "extends": "@sada/tsconfig/base.json"
}
```

**Features:**

- Strict type checking enabled
- ES2022 target
- NodeNext module resolution
- Declaration files generation
- No unchecked indexed access

### `bun.json`

Configuration optimized for Bun runtime applications.

```json
{
  "extends": "@sada/tsconfig/bun.json"
}
```

**Features:**

- ESNext target and module
- Bundler module resolution
- JSX support (react-jsx)
- No emit (Bun handles compilation)

### `react-library.json`

Configuration for React library packages.

```json
{
  "extends": "@sada/tsconfig/react-library.json"
}
```

**Features:**

- Optimized for React component libraries
- JSX support
- Declaration files for type exports

### `tanstack-start.json`

Configuration for TanStack Start applications.

```json
{
  "extends": "@sada/tsconfig/tanstack-start.json"
}
```

**Features:**

- Configured for TanStack Start SSR framework
- React JSX support
- Bundler module resolution

## 🔧 Usage

1. Add the package as a dev dependency in your `package.json`:

```json
{
  "devDependencies": {
    "@sada/tsconfig": "workspace:*"
  }
}
```

2. Extend the appropriate config in your `tsconfig.json`:

```json
{
  "extends": "@sada/tsconfig/base.json",
  "compilerOptions": {
    // Override or add options as needed
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

## 📖 Related Documentation

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [TSConfig Reference](https://www.typescriptlang.org/tsconfig)
