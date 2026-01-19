/**
 * The base interface for a command-line option.
 */
export interface BaseClideOption {
  /** A description of the option for use in help text. */
  description?: string;
  /** The name of an environment variable to use as a fallback value. */
  env?: string;
  /** A boolean indicating if the option should be hidden from help text. */
  hidden?: boolean;
  /** A boolean indicating if the option is required. */
  required?: boolean;
  /** The short-form alias for the option (e.g., 'v'). */
  short?: string;
}

/**
 * Defines a string-based command-line option.
 */
export interface ClideStringOption extends BaseClideOption {
  /** A list of valid string choices. */
  choices?: string[];
  /** The default value for the option if not provided. */
  default?: string;
  /** The type of the option. */
  type: "string";
  /** A function to validate the value of the option. */
  validate?(value: string): boolean | string;
}

/**
 * Defines a boolean-based command-line option.
 */
export interface ClideBooleanOption extends BaseClideOption {
  /** The default value for the option if not provided. */
  default?: boolean;
  /** A boolean indicating if the option can be negated. */
  negatable?: boolean;
  /** The type of the option. */
  type: "boolean";
}

/**
 * Defines a number-based command-line option.
 */
export interface ClideNumberOption extends BaseClideOption {
  /** A list of valid number choices. */
  choices?: number[];
  /** The default value for the option if not provided. */
  default?: number;
  /** The type of the option. */
  type: "number";
  /** A function to validate the value of the option. */
  validate?(value: number): boolean | string;
}

/**
 * A union type for all supported option types.
 */
export type ClideOption = ClideStringOption | ClideBooleanOption | ClideNumberOption;

/**
 * Defines a command within the CLI.
 */
export interface ClideCommand {
  /** A description of the command for use in help text. */
  description?: string;
  /** A key-value pair of option names and their definitions. */
  options?: Record<string, ClideOption>;
}

/**
 * The main configuration object for the `clide` library.
 */
export interface ClideConfig {
  /** A boolean indicating if positional arguments are allowed. */
  allowPositionals?: boolean;
  /** A key-value pair of command names and their definitions. */
  commands?: Record<string, ClideCommand>;
  /** The name of the default command to run when no command is specified. */
  defaultCommand?: string;
  /** A description of the CLI for use in help text. */
  description?: string;
  /** A boolean indicating if help text should be suppressed. */
  disableHelp?: boolean;
  /** A boolean indicating if interactive prompts should be disabled. */
  disablePrompts?: boolean;
  /** A key-value pair of global option names and their definitions. */
  options?: Record<string, ClideOption>;
  /** A function to prompt the user for a value. */
  promptAsync?: (
    optionName: string,
    option: ClideOption,
    scope: OptionScope,
    program: Readonly<ClideProgram>,
  ) => Promise<ClideOptionValue>;
  /** By default, errors are caught and printed to console along with help text. Use this option to override. */
  throwOnError?: boolean;
}

export type ClideOptionValue = string | number | boolean;

/**
 * Represents the parsed output of the CLI, including the command and options.
 */
export interface ClideProgram {
  /** The name of the command executed. Undefined if no commands are configured or executed. */
  command?: string;
  /** Only command-specific options */
  commandOptions: Record<string, ClideOptionValue>;
  /** Only global options */
  globalOptions: Record<string, ClideOptionValue>;
  isDefaultCommand?: boolean;
  /** A key-value pair of all parsed option names and their final values. */
  options: Record<string, ClideOptionValue>;
  positionals?: string[];
}

export type ParsedArgs = { programArgs: string[]; commandArgs: string[] };
export type OptionScope = "global" | "command" | undefined;
