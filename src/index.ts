import type {
  ClideConfig,
  ClideOption,
  ClideOptionValue,
  ClideProgram,
  ClideStringOption,
  OptionScope,
  ParsedArgs,
} from "./types.js";
import "dotenv/config";
import { createInterface } from "node:readline/promises";

export class ClideParser {
  #config: ClideConfig;
  #args: string[];
  #env: Record<string, string | undefined>;

  #truthyValues = ["true", "yes", "1"];
  #falsyValues = ["false", "no", "0"];

  #globalShortsMap = new Map<string, string>();
  #commandShortsMap: Record<string, Map<string, string>> = {};

  #program: ClideProgram = {
    options: {},
    globalOptions: {},
    commandOptions: {},
  };
  #cliArgs: ParsedArgs = { programArgs: [], commandArgs: [] };

  #systemHelpScopes = new Set<string>();

  #defaultPromptAsync = async (
    optionName: string,
    option: ClideOption,
    scope: OptionScope,
    program: Readonly<ClideProgram>,
  ) => {
    let value: ClideOptionValue | undefined;

    while (true) {
      const signal = AbortSignal.timeout(120_000);

      let prompt = `Please enter a value for ${optionName}`;
      prompt += scope === "global" ? ": " : ` (command ${program.command}): `;

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      try {
        value = await rl.question(prompt, { signal });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Prompt timed out. Please enter a value.");
        } else {
          throw error;
        }
      } finally {
        rl.close();
      }

      if (option.type === "boolean") {
        if (this.#truthyValues.includes(value)) {
          value = true;
        } else if (this.#falsyValues.includes(value)) {
          value = false;
        } else {
          console.error("Please enter a valid boolean value.");
          continue;
        }
      }

      if (option.type === "number") {
        value = Number(value);
        if (Number.isNaN(value)) {
          console.error("Please enter a valid number value.");
          continue;
        }
      }

      // biome-ignore-start lint/suspicious/noExplicitAny: _
      if ((option as any).choices && !(option as any).choices.includes(value)) {
        console.error(
          `Please enter a valid value from the choices provided. Choices: ${(option as any).choices.join(", ")}`,
        );
        continue;
      }

      if ((option as any).validate) {
        const validationResult = (option as any).validate(value);
        if (typeof validationResult === "string") {
          console.error(validationResult);
          continue;
        } else if (!validationResult) {
          console.error("Validation failed. Please enter a valid value.");
          continue;
        }
      }
      // biome-ignore-end lint/suspicious/noExplicitAny: _

      return value;
    }
  };

  constructor({
    config,
    args,
    env,
    truthyValues,
    falsyValues,
  }: {
    config: ClideConfig;
    args?: string[];
    env?: Record<string, string | undefined>;
    truthyValues?: string[];
    falsyValues?: string[];
  }) {
    this.#config = { ...config, options: { ...config.options } };

    if (!this.#config.disableHelp) {
      this.#injectHelpOptions();
    }

    this.#config.promptAsync = this.#config.promptAsync ?? this.#defaultPromptAsync;
    if (this.#config.allowPositionals) {
      this.#program.positionals = [];
    }

    this.#args = args ?? process.argv.slice(2);
    this.#env = env ?? process.env;

    this.#truthyValues = truthyValues ?? this.#truthyValues;
    this.#falsyValues = falsyValues ?? this.#falsyValues;
  }

  #injectHelpOptions() {
    const helpOpt: ClideOption = {
      type: "boolean",
      description: "Show help information",
    };

    // 1. Inject Global Help
    if (!this.#config.options?.help) {
      // Check if short 'h' is taken by another global option
      const shortTaken = Object.values(this.#config.options || {}).some((o) => o.short === "h");

      this.#config.options = {
        ...this.#config.options,
        help: { ...helpOpt, short: shortTaken ? undefined : "h" },
      };
      this.#systemHelpScopes.add("global");
    }

    // 2. Inject Command Help
    if (this.#config.commands) {
      for (const [cmdName, cmd] of Object.entries(this.#config.commands)) {
        if (!cmd.options?.help) {
          const shortTaken = Object.values(cmd.options || {}).some((o) => o.short === "h");

          cmd.options = {
            ...cmd.options,
            help: { ...helpOpt, short: shortTaken ? undefined : "h" },
          };
          this.#systemHelpScopes.add(cmdName);
        }
      }
    }
  }

  public async parseConfig(): Promise<ClideProgram> {
    this.#validateConfig();
    this.#splitArgsByCommand();

    try {
      // 2. Parse Options (User Input)
      this.#parseOptionsFromArgs(this.#cliArgs.programArgs, true);
      this.#parseOptionsFromArgs(this.#cliArgs.commandArgs);

      // 3. Check for System Help Trigger
      this.#checkForHelp();

      // 4. Finalize (Validation, Defaults, Prompts)
      await this.#finalizeOptions();
    } catch (error) {
      if (error instanceof Error && !this.#config.disableHelp) {
        console.error(`\x1b[31mError: ${error.message}\x1b[0m\n`);
        this.showHelp();
        process.exit(1);
      }
      throw error;
    }

    return this.#program;
  }

  #checkForHelp() {
    if (!this.#program.options.help) return;

    const currentCommand = this.#program.command;
    if (
      !this.#program.isDefaultCommand &&
      currentCommand &&
      this.#program.commandOptions.help &&
      this.#systemHelpScopes.has(currentCommand)
    ) {
      this.showHelp(currentCommand);
      process.exit(0);
    }

    if (this.#systemHelpScopes.has("global")) {
      this.showHelp();
      process.exit(0);
    }
  }

  /**
   * Generates and prints help text.
   * @param commandName Optional name of the command to show help for. Defaults to current program context.
   */
  public showHelp(commandName?: string) {
    if (this.#config.disableHelp) return;

    // 1. Styling Helper
    const style = {
      bold: (t: string) => `\x1b[1m${t}\x1b[0m`,
      dim: (t: string) => `\x1b[90m${t}\x1b[0m`,
      yellow: (t: string) => `\x1b[33m${t}\x1b[0m`,
      cyan: (t: string) => `\x1b[36m${t}\x1b[0m`,
      red: (t: string) => `\x1b[31m${t}\x1b[0m`,
    };

    const cmdConfig = commandName ? this.#config.commands?.[commandName] : undefined;

    const binName = this.#config.name || "cli";

    // Look up default command
    const defaultCmdName = this.#config.defaultCommand;
    const defaultCmdConfig =
      !commandName && defaultCmdName && this.#config.commands
        ? this.#config.commands[defaultCmdName]
        : undefined;

    // Description
    const description = cmdConfig?.description || this.#config.description || "";

    // 2. Header
    console.log("");
    if (description) console.log(`${description}\n`);

    // 3. Usage
    let usage = `${style.dim("$")} ${binName}`;

    if (commandName && !this.#program.isDefaultCommand) {
      usage += ` ${style.cyan(commandName)}`;
    } else if (!commandName && defaultCmdName) {
      usage += ` ${style.dim(`[${defaultCmdName}]`)}`;
    }

    usage += ` ${style.yellow("[options]")}`;
    if (this.#config.allowPositionals) usage += ` ${style.dim("[arguments]")}`;

    console.log(`${style.bold("USAGE")}`);
    console.log(`  ${usage}\n`);

    // 4. Render Table Helper
    const renderTable = (header: string, items: Record<string, ClideOption>) => {
      const rows = Object.entries(items)
        .filter(([, opt]) => !opt.hidden)
        .map(([name, opt]) => {
          // --- LEFT COLUMN ---
          let leftStyled = "";
          let leftRaw = "";

          // Short Code
          if (opt.short) {
            const s = `-${opt.short}, `;
            leftStyled += style.yellow(s);
            leftRaw += s;
          } else {
            leftStyled += "    ";
            leftRaw += "    ";
          }

          // Long Flag
          leftStyled += style.yellow(`--${name}`);
          leftRaw += `--${name}`;

          // Env Variable
          if (opt.env) {
            const e = `${style.yellow(", ")}${style.dim(opt.env)}`;
            leftStyled += e;
            leftRaw += `, ${opt.env}`;
          }

          // --- RIGHT COLUMN ---
          const metaParts: string[] = [];

          if (opt.type !== "boolean") metaParts.push(`<${opt.type}>`);
          if (opt.required) metaParts.push("required");
          if (opt.default !== undefined) metaParts.push(`default: ${opt.default}`);

          const suffix = metaParts.length > 0 ? style.dim(metaParts.join(", ")) : "";

          const finalDesc = [opt.description, suffix].filter(Boolean).join(" ");

          let choicesStr = "";
          if ((opt as ClideStringOption).choices) {
            const values = (opt as ClideStringOption).choices?.join("|");
            choicesStr = `${style.dim("choices:")} ${values}`;
          }

          return {
            left: leftStyled,
            len: leftRaw.length,
            desc: finalDesc,
            choices: choicesStr,
          };
        });

      if (rows.length === 0) return;

      console.log(`${style.bold(header.toUpperCase())}`);

      const COLUMN_WIDTH = 40;

      rows.forEach((row) => {
        const line = `  ${row.left}`;
        let padding = "";

        if (row.len < COLUMN_WIDTH - 2) {
          padding = " ".repeat(COLUMN_WIDTH - row.len);
        } else {
          padding = `\n${" ".repeat(COLUMN_WIDTH + 2)}`;
        }

        console.log(`${line}${padding}${row.desc}`);

        if (row.choices) {
          const indent = " ".repeat(COLUMN_WIDTH + 2);
          console.log(`${indent}${row.choices}`);
        }
      });
      console.log("");
    };

    // --- DYNAMIC ORDERING LOGIC ---

    if (commandName) {
      // CASE 1: Explicit Command (e.g., "cli deploy --help")
      // PRIORITY: Command Options -> Global Options

      if (cmdConfig?.options) {
        renderTable(`Command Options (${commandName})`, cmdConfig.options);
      }

      if (this.#config.options) {
        renderTable("Global Options", this.#config.options);
      }
    } else {
      // CASE 2: Root (e.g., "cli --help")
      // PRIORITY: Global Options -> Default Command Options

      if (this.#config.options) {
        renderTable("Global Options", this.#config.options);
      }

      if (defaultCmdConfig?.options) {
        renderTable(`Default Command Options (${defaultCmdName})`, defaultCmdConfig.options);
      }
    }

    // --- COMMANDS LIST ---
    if (!commandName && this.#config.commands) {
      console.log(`${style.bold("COMMANDS")}`);

      const rows = Object.entries(this.#config.commands).map(([name, def]) => {
        let displayName = name;
        let displayHtml = style.cyan(name);

        if (name === defaultCmdName) {
          const tag = " (default)";
          displayName += tag;
          displayHtml += style.dim(tag);
        }

        return {
          rawLength: displayName.length,
          printName: displayHtml,
          desc: def.description || "",
        };
      });

      const maxLen = Math.max(...rows.map((r) => r.rawLength)) + 4;

      for (const row of rows) {
        const padding = " ".repeat(maxLen - row.rawLength);
        console.log(`  ${row.printName}${padding}${row.desc}`);
      }
      console.log("");
    }
  }

  #validateConfig() {
    const { defaultCommand, commands, options } = this.#config;

    if (defaultCommand && !commands?.[defaultCommand]) {
      throw new Error(
        `Error in clide config. Default command "${defaultCommand}" not found in config`,
      );
    }

    const nameRegex = /^[a-z][a-z0-9-_]*$/;
    const shortOptionRegex = /^[a-zA-Z]$/;

    const checkName = (name: string, errPrefix: string) => {
      const errSuffix = ` must start with an alphabet and contain only lowercase letters, numbers, hyphens, and underscores.`;
      const lowerCaseError = ` must be all lower case. `;
      if (name !== name.toLowerCase()) {
        throw new Error(`Error in clide config. ${errPrefix} "${name}"${lowerCaseError}`);
      }
      if (!nameRegex.test(name)) {
        throw new Error(`Error in clide config. ${errPrefix} "${name}"${errSuffix}`);
      }
    };

    const checkShortOption = (shortOptionName: string) => {
      if (!shortOptionRegex.test(shortOptionName)) {
        const errSuffix = ` must be a single alphabetical character. `;
        throw new Error(`Error in clide config. Short option "${shortOptionName}"${errSuffix}`);
      }
    };

    for (const [optName, option] of Object.entries(options ?? {})) {
      checkName(optName, "Option name");
      if (option.short) {
        checkShortOption(option.short);
        if (this.#globalShortsMap.has(option.short)) {
          const existing = this.#globalShortsMap.get(option.short);
          throw new Error(
            `Error in clide config: Short option "-${option.short}" (on "--${optName}") is already in use by "--${existing}".`,
          );
        } else {
          this.#globalShortsMap.set(option.short, optName);
        }
      }

      if (option.type === "boolean" && option.negatable) {
        const negatedName = `no-${optName}`;
        if (options?.[negatedName]) {
          throw new Error(
            `Error in clide config. Boolean option "${optName}" is negatable but a conflicting option "${negatedName}" is already defined.`,
          );
        }
      }
    }

    for (const [cmdName, cmd] of Object.entries(commands ?? {})) {
      checkName(cmdName, "Command name ");

      for (const [optName, option] of Object.entries(cmd.options ?? {})) {
        checkName(optName, "Option name");
        if (option.short) {
          checkShortOption(option.short);
          if (this.#commandShortsMap[cmdName]) {
            if (this.#commandShortsMap[cmdName].has(option.short)) {
              throw new Error(
                `Error in clide config. Short option "${option.short}" is already in use for command "${cmdName}".`,
              );
            } else {
              this.#commandShortsMap[cmdName].set(option.short, optName);
            }
          } else {
            this.#commandShortsMap[cmdName] = new Map();
            this.#commandShortsMap[cmdName].set(option.short, optName);
          }
        }

        if (option.type === "boolean" && option.negatable) {
          const negatedName = `no-${optName}`;
          if (cmd.options?.[negatedName]) {
            throw new Error(
              `Error in clide config. Boolean option "${optName}" in command "${cmdName}" is negatable but a conflicting option "${negatedName}" is already defined.`,
            );
          }
        }
      }
    }
  }

  #splitArgsByCommand() {
    const args = this.#args;
    const { commands, defaultCommand } = this.#config;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i] as string;

      // if current element is a command, everything before are program args and everything after are command args
      if (commands?.[arg.toLowerCase()]) {
        // TODO: check if arg might be a value of previous arg instead of a command
        this.#cliArgs.commandArgs = args.slice(i + 1);
        this.#cliArgs.programArgs = args.slice(0, i);
        this.#program.command = arg.toLowerCase();
        return;
      }
    }

    if (!this.#program.command && defaultCommand) {
      this.#program.isDefaultCommand = true;
      this.#program.command = defaultCommand;
      this.#cliArgs.commandArgs = args;
    }

    if (!this.#program.command) {
      this.#cliArgs.programArgs = args;
    }
  }

  #parseOptionsFromArgs(args: string[], isProgramArgs?: boolean) {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i] as string;

      let optionName: string | undefined;
      let optionValue: string | boolean | number | undefined;
      let isShortOption: boolean = false;

      if (arg.startsWith("--")) {
        optionName = arg.slice(2);
      } else if (arg.startsWith("-")) {
        let shortOptions = arg.slice(1).split("");
        const eqIndex = shortOptions.indexOf("=");
        if (eqIndex !== -1) {
          shortOptions = [
            ...shortOptions.slice(0, eqIndex - 1),
            shortOptions.slice(eqIndex - 1).join(""),
          ];
        }

        for (const [j, shortOption] of shortOptions.entries()) {
          if (j === shortOptions.length - 1) {
            optionName = shortOption;
            isShortOption = true;
            break;
          }
          const {
            scope,
            option,
            optionName: resolvedOptionName,
          } = this.getOption(undefined, shortOption, isProgramArgs);
          if (option?.type === "boolean" && resolvedOptionName) {
            this.#setProgramOption(resolvedOptionName, true, scope);
          } else {
            throw new Error(`Invalid option "${arg}". `);
          }
        }
      } else {
        if (this.#config.allowPositionals) {
          this.#program.positionals?.push(arg);
          continue;
        } else {
          throw new Error(`Unknown argument "${arg}". `);
        }
      }

      if (optionName === undefined) {
        throw new Error(`Unknown option "${arg}". `);
      }

      const eqIndex = optionName.indexOf("=");
      if (eqIndex !== -1) {
        optionValue = optionName.slice(eqIndex + 1);
        optionName = optionName.slice(0, eqIndex);
      }

      let {
        scope,
        optionName: resolvedOptionName,
        option,
      } = isShortOption
        ? this.getOption(undefined, optionName, isProgramArgs)
        : this.getOption(optionName, undefined, isProgramArgs);

      if (!option && resolvedOptionName?.startsWith("no-")) {
        resolvedOptionName = resolvedOptionName.slice(3);
        ({
          scope,
          option,
          optionName: resolvedOptionName,
        } = this.getOption(resolvedOptionName, undefined, isProgramArgs));
        if (option?.type !== "boolean" || !option.negatable) {
          option = undefined;
        } else {
          resolvedOptionName = `no-${resolvedOptionName}`;
        }
      }

      if (!option || !resolvedOptionName) {
        throw new Error(`Unknown option "${arg}". `);
      }

      const nextArg = args[i + 1];

      // process boolean option
      if (option.type === "boolean") {
        // check next arg if --flag=true format is not there
        if (
          optionValue === undefined &&
          [...this.#truthyValues, ...this.#falsyValues].includes(nextArg?.toLowerCase() ?? "")
        ) {
          optionValue = nextArg;
          i++;
        }

        if (optionValue === undefined) {
          optionValue = true;
        } else if (this.#truthyValues.includes((optionValue as string).toLowerCase())) {
          optionValue = true;
        } else if (this.#falsyValues.includes((optionValue as string).toLowerCase())) {
          optionValue = false;
        } else {
          throw new Error(`Unknown boolean value "${optionValue}". `);
        }

        this.#setProgramOption(resolvedOptionName, optionValue, scope);
        continue;
      }

      if (optionValue === undefined) {
        if (nextArg) {
          optionValue = nextArg;
          i++;
        } else {
          throw new Error(`Missing value for option "${optionName}". `);
        }
      }

      if (option.type === "number") {
        optionValue = Number(optionValue);
        if (Number.isNaN(optionValue)) {
          throw new Error(`Value "${optionValue}" for option "${optionName}" is not a number. `);
        }
      }

      this.#setProgramOption(resolvedOptionName, optionValue, scope);
    }
  }

  async #finalizeOptions() {
    const optionsToPrompt = {
      global: new Set<string>(),
      command: new Set<string>(),
    };
    const { commands } = this.#config;
    const command = this.#program.command;
    const scopes = ["global", "command"] as const;

    // Set Defaults and find required options to prompt
    for (const scope of scopes) {
      const options: [string, ClideOption][] =
        scope === "global"
          ? Object.entries(this.#config.options ?? {})
          : Object.entries(commands?.[command ?? ""]?.options ?? {});

      for (const [optionName, option] of options) {
        if (this.#program.options[optionName] !== undefined) continue;

        const envVal = option.env ? this.#env[option.env] : undefined;
        let value = envVal !== undefined ? envVal : option.default;

        if (option.type === "boolean" && value !== undefined && typeof value !== "boolean") {
          value = (value as string).toLowerCase();
          if (this.#truthyValues.includes(value) || value.length === 0) {
            value = true;
          } else if (this.#falsyValues.includes(value)) {
            value = false;
          } else {
            value = undefined;
          }
        }

        if (option.type === "number" && value !== undefined && typeof value !== "number") {
          value = Number(value);
          if (Number.isNaN(value)) {
            value = undefined;
          }
        }

        if (value !== undefined) {
          this.#setProgramOption(optionName, value, scope);
          continue;
        }

        if (option.required) {
          if (this.#config.disablePrompts) {
            const errSuffix = scope === "global" ? ". " : ` for command "${command}". `;
            throw new Error(`Missing required option "${optionName}"${errSuffix}`);
          } else {
            optionsToPrompt[scope].add(optionName);
          }
        }
      }
    }

    // Validate Options
    for (const scope of scopes) {
      const options: [string, ClideOptionValue][] = Object.entries(
        this.#program[scope === "global" ? "globalOptions" : "commandOptions"],
      );
      // iterate over program options
      for (const [optionName, optionValue] of options) {
        const { option } = this.getOption(optionName, undefined, scope === "global");
        if (!option) continue;

        this.#validateOption(option, optionName, optionValue);
      }
    }

    // Prompt For Options
    if (!this.#config.disablePrompts && this.#config.promptAsync !== undefined) {
      for (const scope of scopes) {
        for (const optionName of optionsToPrompt[scope]) {
          const {
            optionName: resolvedOptionName,
            option,
            scope: resolvedScope,
          } = this.getOption(optionName, undefined, scope === "global");
          if (!option || !resolvedOptionName) continue;

          const optionValue = await this.#config.promptAsync(
            resolvedOptionName,
            option,
            resolvedScope,
            this.#program,
          );

          this.#validateOption(option, resolvedOptionName, optionValue);

          this.#setProgramOption(optionName, optionValue, scope);
        }
      }
    } else if (optionsToPrompt.global.size > 0) {
      throw new Error(
        `Missing required options ${Array.from(optionsToPrompt.global)
          .map((o) => `--${o}`)
          .join(", ")}. `,
      );
    } else if (optionsToPrompt.command.size > 0) {
      throw new Error(
        `Missing required options ${Array.from(optionsToPrompt.command)
          .map((o) => `--${o}`)
          .join(", ")} for command "${command}". `,
      );
    }
  }

  #setProgramOption(
    optionName: string,
    optionValue: string | number | boolean,
    scope: OptionScope,
  ) {
    if (optionName.startsWith("no-") && typeof optionValue === "boolean") {
      optionName = optionName.slice(3);
      optionValue = !optionValue;
    }
    this.#program.options[optionName] = optionValue;
    if (scope === "command") {
      this.#program.commandOptions[optionName] = optionValue;
    }
    if (scope === "global") {
      this.#program.globalOptions[optionName] = optionValue;
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: _
  #validateOption(option: any, optionName: string, optionValue: ClideOptionValue) {
    // validate type
    if (option.type === "boolean" && typeof optionValue !== "boolean") {
      throw new Error(`Value "${optionValue}" for option "${optionName}" is not a boolean. `);
    }
    if (
      option.type === "number" &&
      (typeof optionValue !== "number" || Number.isNaN(optionValue))
    ) {
      throw new Error(`Value "${optionValue}" for option "${optionName}" is not a number. `);
    }
    if (option.type === "string" && typeof optionValue !== "string") {
      throw new Error(`Value "${optionValue}" for option "${optionName}" is not a string. `);
    }

    // validate choices
    if (option.choices && !option.choices.includes(optionValue)) {
      throw new Error(
        `Value "${optionValue}" for option "${optionName}" is not a valid choice.` +
          ` Valid choices are ${option.choices.join(", ")}. `,
      );
    }

    // validate value
    if (option.validate) {
      const validation = option.validate(optionValue);
      if (typeof validation === "string") {
        throw new Error(validation);
      }
      if (!validation) {
        throw new Error(`Value "${optionValue}" for option "${optionName}" is invalid.`);
      }
    }
  }

  getOption(optionName?: string, shortOptionName?: string, isProgramOption?: boolean) {
    const { options, commands } = this.#config;
    const command = isProgramOption ? undefined : this.#program.command;
    let scope: OptionScope;

    let option: ClideOption | undefined;
    optionName = optionName?.toLowerCase();

    // check global options first when dealing with default commands
    if (!command || this.#program.isDefaultCommand) {
      if (shortOptionName) {
        optionName = this.#globalShortsMap.get(shortOptionName);
      }
      if (optionName) {
        option = options?.[optionName];
      }
      if (option) scope = "global";
    }

    if (!option && command) {
      if (shortOptionName) {
        optionName = this.#commandShortsMap[command]?.get(shortOptionName);
      }
      if (optionName) {
        option = commands?.[command]?.options?.[optionName];
      }
      if (option) scope = "command";
    }
    return { scope, optionName, option };
  }
}

export default async function clide(config: ClideConfig) {
  return await new ClideParser({ config }).parseConfig();
}
export type * from "./types.js";
