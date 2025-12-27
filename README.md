# Clide

**Clide** is a lightweight, type-safe, and interactive command-line interface (CLI) builder for Node.js and Bun. It streamlines argument parsing, validation, and auto-generates help text, allowing you to focus on your tool's logic rather than boilerplate.

## Features

* **Type-Safe Configuration**: Built with TypeScript in mind.
* **Subcommand System**: Support for organizing tools into specific actions (e.g., `cli build`, `cli deploy`).
* **Rich Option Types**: Native support for Strings, Numbers, and Booleans.
* **Interactive Prompts**: Automatically prompts users for missing required options.
* **Environment Variables**: Bind options directly to environment variables (e.g., `env: 'PORT'`).
* **Validation**: Built-in validators, specific choice lists, and custom validation functions.
* **Auto-Help**: Automatically generates beautiful help menus (`--help`).
* **Short Aliases**: Support for short flags (e.g., `-v` for `--verbose`) and flag stacking (e.g., `-xzf`).

## Installation

```bash
npm install @imlokesh/clide
# or
bun add @imlokesh/clide
```

## Quick Start

Create a simple CLI with a single option.

```typescript
import clide from "clide";

const config = {
  description: "My Awesome CLI",
  options: {
    name: {
      type: "string",
      short: "n",
      description: "The name to greet",
      default: "World",
    },
    verbose: {
      type: "boolean",
      short: "v",
      description: "Enable verbose logging",
    },
  },
};

// Run the parser
const result = await clide(config);

if (result.options.verbose) {
  console.log("Debug mode enabled");
}

console.log(`Hello, ${result.options.name}!`);
```

**Run it:**
```bash
node cli.js --name "Clide User" -v
# Output:
# Debug mode enabled
# Hello, Clide User!
```

## Configuration

The core of Clide is the configuration object passed to the main function.

### Options (`ClideOption`)

Options can be defined globally or within specific commands.

| Property | Type | Description |
| :--- | :--- | :--- |
| `type` | `"string" \| "number" \| "boolean"` | **Required.** The data type of the option. |
| `short` | `string` | A single-character alias (e.g., `'p'` for `-p`). |
| `description` | `string` | Help text description. |
| `required` | `boolean` | If true, will prompt the user if missing. |
| `default` | `any` | The default value if not provided. |
| `env` | `string` | Environment variable to fallback to. |
| `choices` | `string[] \| number[]` | Array of allowed values. |
| `validate` | `Function` | Custom validation logic. |
| `negatable` | `boolean` | (Boolean only) Allows `--no-flag` to set value to false. |

#### Example: Detailed Options

```typescript
options: {
  port: {
    type: "number",
    short: "p",
    default: 3000,
    env: "SERVER_PORT",
    validate: (n) => n > 1024 || "Port must be > 1024"
  },
  mode: {
    type: "string",
    choices: ["dev", "prod", "test"],
    required: true // Will trigger a prompt if missing
  }
}
```

### Commands

Clide supports a single level of subcommands (flat structure). Commands are defined in the `commands` object.

```typescript
import clide from "clide";

const { command, options } = await clide({
  name: "app-cli",
  commands: {
    // Defines 'node cli.js serve'
    serve: {
      description: "Start the server",
      options: {
        port: { type: "number", default: 8080 },
      },
    },
    // Defines 'node cli.js build'
    build: {
      description: "Build the project",
      options: {
        minify: { type: "boolean", short: "m" },
        out: { type: "string", required: true },
      },
    },
  },
});

if (command === "serve") {
  console.log(`Starting server on port ${options.port}...`);
} else if (command === "build") {
  console.log(`Building to ${options.out} (Minified: ${options.minify})...`);
}
```

## Interactive Prompts

If an option is marked as `required: true` and the user does not provide it via flags or environment variables, Clide will automatically pause execution and prompt the user for input.

```typescript
options: {
  token: {
    type: "string",
    required: true,
    description: "API Token"
  }
}
```

* **Runtime behavior:**
    ```text
    $ node cli.js
    Please enter a value for token: _
    ```

To disable this behavior, set `disablePrompts: true` in your root config.

## Environment Variables

Clide loads `.env` files automatically (via `dotenv`). You can link options to environment variables easily.

```typescript
options: {
  apiKey: {
    type: "string",
    env: "API_KEY" // Will look for process.env.API_KEY
  }
}
```

Priority order:
1.  Command Line Arguments (`--api-key`)
2.  Environment Variables (`API_KEY`)
3.  Default Value (`default: "..."`)
4.  Interactive Prompt (if `required`)

## Positional Arguments

By default, strict parsing is enabled. To accept positional arguments (arguments without flags), set `allowPositionals: true`.

```typescript
const result = await clide({
  allowPositionals: true,
  options: { verbose: { type: "boolean" } }
});

// Run: node cli.js file1.txt file2.txt --verbose
console.log(result.positionals); // ["file1.txt", "file2.txt"]
```

## TypeScript Usage

Clide exports types to help you strongly type your configuration and results.

```typescript
import clide, { type ClideConfig } from "clide";

const config: ClideConfig = {
  // ... fully typed config
};
```

## License

MIT