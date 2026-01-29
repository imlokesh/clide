# Clide

**Clide** ("Command Line Guide") is a lightweight, type-safe, and interactive command-line interface (CLI) builder for Node.js and Bun. It streamlines argument parsing, validation, and auto-generates help text, allowing you to focus on your tool's logic rather than boilerplate.

## Install

```bash
bun add @imlokesh/clide
#or
npm install @imlokesh/clide
```

## Basic Usage

Create a simple CLI with a string and a boolean option, and an about command. 

```typescript
// index.ts
import clide, { type ClideConfig } from "@imlokesh/clide";

const config: ClideConfig = {
  description: "This is a test for clide",
  throwOnError: true,
  allowPositionals: true,
  defaultCommand: "about",
  options: {
    name: {
      type: "string",
      short: "n",
      description: "The name to greet",
      default: "World",
    },
    shout: {
      type: "boolean",
      short: "s",
      description: "Make the greeting loud",
    },
  },
  commands: {
    about: { description: "About this app" },
  },
};

// Parse clide config
try {
  const program = await clide(config);

  let message = `Hello, ${program.options.name}!`;

  if (program.options.shout) {
    message = message.toUpperCase();
  }

  if (program.command === "about") {
    console.log("This is a sample app that greets users. ");
  }

  console.log(message);
} catch (e) {
  console.error(`Error: ${(e as Error).message}`);
}
```

Then run the program like this. 

```bash
$ bun index.ts
# Hello, World!

$ bun index.ts --name Dev
# Hello, Dev!

$ bun index.ts --name=Dev
# Hello, Dev!

$ bun index.ts -n Dev
# Hello, Dev!

$ bun index.ts --shout
# HELLO, WORLD!

$ bun index.ts -sn dev
# HELLO, DEV!

$ bun index.ts about
# This is a sample app that greets users. 
# Hello, World!
```

### --help
Clide automatically generates a `--help,-h` option for the main program and each command. You can disable this using the `disableHelp` option.

Moreover, by default, if an error occurs while parsing options, the program will print the error message, show help information, and then exit with a non-zero status code. You can disable this using the `throwOnError` option to throw the error and work with it in your own code.

```bash
$ bun index.ts --help
# 
# This is a test for clide
# 
# Global Options
#   -n, --name                              The name to greet <string>, default: World
#   -s, --shout                             Make the greeting loud
#   -h, --help                              Show help information
# 
# Default Command Options (about)
#   -h, --help                              Show help information
# 
# COMMANDS
#   about (default)    About this app
```

## Required Options & Prompts

If an option is marked as `required` and not provided, Clide will request
a value using the configured prompt handler.

A default handler is included but you can customize it using the `promptAsync` option.

## Options

```ts
options: {
  port: {
    type: "number",
    default: 3000,
    env: "PORT",
    description: "Server port",
  },
  format: {
    type: "string",
    choices: ["json", "yaml", "text"],
  },
  age: {
    type: "number",
    validate: (v) => v > 0 || "Age must be positive",
  },
}
```

Supported option types:

- string
- number
- boolean

Supported features per option:

- short aliases
- defaults
- environment variable fallback
- required prompts
- value validation
- allowed choices
- hidden options

## Commands

Commands allow you to group behavior and options.

```ts
commands: {
  build: {
    description: "Build the project",
    options: {
      watch: { type: "boolean" },
    },
  },
}
```

Global options must appear before the command.

```bash
# ❌ invalid
cli build --watch --port 3000

# ✅ valid
cli --port 3000 build --watch
```

## Return Value

```ts
const program = await clide(config);

// program.command is the name of selectedcommand
// program.options are the parsed options
// program.globalOptions are the parsed global options
// program.commandOptions are the parsed command options
// program.positionals are the parsed positionals (only if allowPositionals is true in config)
// program.isDefaultCommand is true if the user did not explicitly provide a command
```

## License

MIT