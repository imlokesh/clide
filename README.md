# Clide

**Clide** ("Command Line Guide") is a lightweight, type-safe, and interactive command-line interface (CLI) builder for Node.js and Bun. It streamlines argument parsing, validation, and auto-generates help text, allowing you to focus on your tool's logic rather than boilerplate.

## Install

```bash
bun add @imlokesh/clide
# or
npm install @imlokesh/clide
```

## Quick Start

Create a CLI with global options, commands, and validation.

```typescript
// index.ts
import clide from "@imlokesh/clide";

const program = await clide({
  description: "A friendly CLI tool",
  defaultCommand: "greet",
  options: {
    verbose: { type: "boolean", short: "v", description: "Enable verbose logs" },
  },
  commands: {
    greet: {
      description: "Greet a user",
      options: {
        name: { type: "string", short: "n", default: "World" },
        shout: { type: "boolean", short: "s" },
      },
    },
  },
});

if (program.command === "greet") {
  let msg = `Hello, ${program.options.name}`;
  if (program.options.shout) msg = msg.toUpperCase();
  console.log(msg);
}
```

## Commands

Commands allow you to group options and behavior. Options defined inside a command are isolated to that command.

```typescript
commands: {
  build: {
    options: { minify: { type: "boolean" } }
  },
  deploy: {
    options: { target: { type: "string" } }
  }
}
```

### Default Command
You can define a `defaultCommand` to run when no command is specified. This is useful for single-purpose CLIs or tools with a primary action (like `npm install`).

```typescript
const program = await clide({
  defaultCommand: "start",
  commands: {
    start: {
      description: "Start the server",
      options: { port: { type: "number", default: 3000 } }
    }
  }
});
```

When a user runs the CLI without a command, Clide treats it as an invocation of the default command:

```bash
# Runs "start" command with default options
$ cli

# Runs "start" command with custom options
$ cli --port 8080
```

## Options Configuration

Options are typed, validated, and can be configured globally or per-command.

```typescript
options: {
  // String with choices
  format: {
    type: "string",
    choices: ["json", "text"],
    default: "text",
  },
  
  // Number with validation
  port: {
    type: "number",
    env: "PORT", 
    validate: (n) => n > 1000 || "Port must be > 1000", // Return string for custom error
  },

  // Boolean (Negatable)
  color: {
    type: "boolean",
    default: true,
    negatable: true, // Auto-generates --no-color flag
  },
  
  // Required (Triggers Prompt)
  token: {
    type: "string",
    required: true,
    hidden: true, // Hides from help menu
  }
}
```

### Option Precedence
Clide resolves option values in the following order (highest priority first):

1.  **Command Line Flag** (`--port 3000`)
2.  **Environment Variable** (`PORT=3000`)
3.  **Default Value** (`default: 8080`)

If an option is `required` and no value is found in any of these three places, Clide will trigger an interactive prompt (unless disabled).

## Input Features

### Short Flag Stacking
Clide supports stacking boolean short flags. If the last flag in the stack expects a value, it captures the next argument.

```bash
# Equivalent to: --verbose --force --user admin
$ cli -vfu admin
```

### Positional Arguments & Terminator
To accept loose arguments (values without flags), enable `allowPositionals`.

Clide also supports the standard POSIX `--` terminator. Everything following `--` is **always** captured as a positional argument, regardless of the `allowPositionals` setting. This stops the parser from interpreting subsequent arguments as flags or commands.

```bash
# "-file.txt" is captured as a positional argument, not a flag
$ cli -- -file.txt
```

```typescript
// program.positionals -> ["-file.txt"]
```

### Strict Ordering
Global options must appear *before* the command, and command options *after* the command.

```bash
# ✅ Correct
$ cli --verbose build --minify

# ❌ Incorrect (Global flag after command)
$ cli build --minify --verbose
```

## Prompts & Interactivity

If a `required` option is missing, Clide automatically prompts the user for input using `readline`.

### Custom Prompts
You can override the default prompt behavior (e.g., to use `inquirer` or `prompts`) using `promptAsync`.

```typescript
import clide, { type ClideOption, type OptionScope, type ClideProgram } from "@imlokesh/clide";

await clide({
  /* config */
  promptAsync: async (name: string, option: ClideOption, scope: OptionScope, program: Readonly<ClideProgram>) => {
    // Implement your custom prompt logic here
    return "user-value"; 
  }
});
```

## Help & Error Handling

### Auto-Generated Help
Clide automatically injects a `--help, -h` option for the main program and every command.

```bash
$ bun index.ts --help
```

It intelligently handles conflicts: if you define a custom option with `short: "h"`, Clide will only use `--help` for the help menu, freeing up `-h` for your option.

### Error Handling
By default, if an argument parsing error occurs (e.g., unknown option, missing value), Clide will:
1. Print the error message in red.
2. Display the help menu.
3. Exit the process with code `1`.

You can override this behavior using `throwOnError: true` to catch errors manually.

## API Reference

### Return Object

The `clide` function returns a `program` object containing parsed data.

```typescript
const program = await clide(config);

program.command          // (string) Name of the selected command
program.options          // (object) Merged map of all active options (global + command)
program.globalOptions    // (object) Only global options
program.commandOptions   // (object) Only command-specific options
program.positionals      // (string[]) Array of positional args (if allowed or forced by --)
program.isDefaultCommand // (boolean) True if the default command was inferred
```

### Config Options

| Option | Type | Description |
| :--- | :--- | :--- |
| `description` | `string` | CLI description for help text. |
| `commands` | `object` | Definitions for subcommands. |
| `options` | `object` | Global option definitions. |
| `defaultCommand` | `string` | Command to run if none specified. |
| `allowPositionals` | `boolean` | Enable parsing of loose arguments. |
| `throwOnError` | `boolean` | If true, throws error object instead of printing help and exiting. |
| `disableHelp` | `boolean` | Disables auto-generated `--help`. |
| `disablePrompts` | `boolean` | Disables interactive prompts for missing required options. |

## License

MIT