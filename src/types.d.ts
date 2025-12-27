/**
 * The base interface for a command-line option.
 */
export interface BaseClideOption {
	/** The short-form alias for the option (e.g., 'v'). */
	short?: string;
	/** A boolean indicating if the option is required. */
	required?: boolean;
	/** The name of an environment variable to use as a fallback value. */
	env?: string;
	/** A description of the option for use in help text. */
	description?: string;
	/** A boolean indicating if the option should be hidden from help text. */
	hidden?: boolean;
}

/**
 * Defines a string-based command-line option.
 */
export interface ClideStringOption extends BaseClideOption {
	/** The type of the option. */
	type: "string";
	/** The default value for the option if not provided. */
	default?: string;
	/** A list of valid string choices. */
	choices?: string[];
	/** A function to validate the value of the option. */
	validate?(value: string): boolean | string;
}

/**
 * Defines a boolean-based command-line option.
 */
export interface ClideBooleanOption extends BaseClideOption {
	/** The type of the option. */
	type: "boolean";
	/** The default value for the option if not provided. */
	default?: boolean;
	/** A boolean indicating if the option can be negated. */
	negatable?: boolean;
}

/**
 * Defines a number-based command-line option.
 */
export interface ClideNumberOption extends BaseClideOption {
	/** The type of the option. */
	type: "number";
	/** The default value for the option if not provided. */
	default?: number;
	/** A list of valid number choices. */
	choices?: number[];
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
	/** A key-value pair of option names and their definitions. */
	options?: Record<string, ClideOption>;
	/** A description of the command for use in help text. */
	description?: string;
}

/**
 * The main configuration object for the `clide` library.
 */
export interface ClideConfig {
	/** The name of the CLI program. */
	name?: string;
	/** A boolean indicating if positional arguments are allowed. */
	allowPositionals?: boolean;
	/** A key-value pair of command names and their definitions. */
	commands?: Record<string, ClideCommand>;
	/** The name of the default command to run when no command is specified. */
	defaultCommand?: string;
	/** A key-value pair of global option names and their definitions. */
	options?: Record<string, ClideOption>;
	/** A description of the CLI for use in help text. */
	description?: string;
	/** A boolean indicating if help text should be printed. */
	disablePrompts?: boolean;
	/** A boolean indicating if help text should be printed. */
	disableHelp?: boolean;
	/** A function to prompt the user for a value. */
	promptAsync?: (
		optionName: string,
		option: ClideOption,
		scope: OptionScope,
		program: Readonly<ClideProgram>,
	) => Promise<ClideOptionValue>;
}

export type ClideOptionValue = string | number | boolean;

/**
 * Represents the parsed output of the CLI, including the command and options.
 */
export interface ClideProgram {
	/** The name of the command executed. Undefined if no commands are configured or executed. */
	command?: string;
	positionals?: string[];
	isDefaultCommand?: boolean;
	/** A key-value pair of all parsed option names and their final values. */
	options: Record<string, ClideOptionValue>;
	/** Only global options */
	globalOptions: Record<string, ClideOptionValue>;
	/** Only command-specific options */
	commandOptions: Record<string, ClideOptionValue>;
}

export type ParsedArgs = { programArgs: string[]; commandArgs: string[] };
export type OptionScope = "global" | "command" | undefined;
