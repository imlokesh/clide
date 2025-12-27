import { describe, expect, mock, spyOn, test } from "bun:test";
import clide, { ClideParser } from ".";
import type { ClideConfig } from "./types";

// --- Test Helpers ---

const createConfig = (overrides: Partial<ClideConfig> = {}): ClideConfig => ({
  options: {
    verbose: { type: "boolean", short: "v" },
    output: { type: "string", short: "o" },
    retries: { type: "number", short: "r" },
  },
  disableHelp: true,
  ...overrides,
});

const parse = async (config: ClideConfig, args: string[], env?: Record<string, string>) =>
  await new ClideParser({ config, args, env }).parseConfig();

const setupMocks = () => {
  const logs: string[] = [];
  const errors: string[] = [];

  const logSpy = spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));
  const errSpy = spyOn(console, "error").mockImplementation((m) => errors.push(String(m)));
  const exitSpy = spyOn(process, "exit").mockImplementation((code) => {
    throw { message: `PROCESS_EXIT_${code}` };
  });

  return {
    logs,
    errors,
    restore: () => {
      logSpy.mockRestore();
      errSpy.mockRestore();
      exitSpy.mockRestore();
    },
  };
};

// --- Test Suite ---

describe("Core Argument Parsing", () => {
  describe("Boolean Options", () => {
    test("parses long flags", async () => {
      const result = await parse(createConfig(), ["--verbose"]);
      expect(result.options.verbose).toBe(true);
    });

    test("parses short flags", async () => {
      const result = await parse(createConfig(), ["-v"]);
      expect(result.options.verbose).toBe(true);
    });

    test("parses explicit boolean values (true/false)", async () => {
      const result = await parse(createConfig(), ["--verbose=false"]);
      expect(result.options.verbose).toBe(false);

      const result2 = await parse(createConfig(), ["--verbose", "false"]);
      expect(result2.options.verbose).toBe(false);
    });

    test("handles negatable flags", async () => {
      const config = createConfig({
        options: { retry: { type: "boolean", negatable: true } },
      });

      expect((await parse(config, ["--retry"])).options.retry).toBe(true);
      expect((await parse(config, ["--no-retry"])).options.retry).toBe(false);
      expect((await parse(config, ["--no-retry=false"])).options.retry).toBe(true);
    });

    test("throws on invalid boolean syntax", async () => {
      expect(parse(createConfig(), ["--verbose=not-a-bool"])).rejects.toThrow(
        /Unknown boolean value/,
      );
    });
  });

  describe("String & Number Options", () => {
    test("parses strings with spaces", async () => {
      const result = await parse(createConfig(), ["--output", "hello world"]);
      expect(result.options.output).toBe("hello world");
    });

    test("parses equals sign assignment", async () => {
      const result = await parse(createConfig(), ["--retries=5"]);
      expect(result.options.retries).toBe(5);
    });

    test("parses mixed short/long combined options", async () => {
      const result = await parse(createConfig(), ["-v", "-r", "10"]);
      expect(result.options).toMatchObject({ verbose: true, retries: 10 });
    });

    test("throws if number option receives text", async () => {
      await expect(parse(createConfig(), ["--retries", "five"])).rejects.toThrow(/is not a number/);
    });
  });

  describe("Short Flag Stacking", () => {
    const config = createConfig({
      options: {
        verbose: { type: "boolean", short: "v" },
        force: { type: "boolean", short: "f" },
        user: { type: "string", short: "u" },
      },
    });

    test("parses multiple booleans", async () => {
      const result = await parse(config, ["-vf"]);
      expect(result.options).toMatchObject({ verbose: true, force: true });
    });

    test("parses booleans followed by string assignment", async () => {
      const result = await parse(config, ["-vfu", "admin"]);
      expect(result.options).toMatchObject({
        verbose: true,
        force: true,
        user: "admin",
      });
    });

    test("parses combined flags with equals assignment", async () => {
      const result = await parse(config, ["-vfu=admin"]);
      expect(result.options.user).toBe("admin");
    });
  });
});

describe("Configuration & Environment", () => {
  describe("Environment Variables & Defaults", () => {
    const config = createConfig({
      options: {
        mode: { type: "string", default: "prod", env: "APP_MODE" },
        debug: { type: "boolean", default: false, env: "APP_DEBUG" },
      },
    });

    test("uses default when nothing provided", async () => {
      const result = await parse(config, []);
      expect(result.options).toEqual({ mode: "prod", debug: false });
    });

    test("uses environment variable if arg missing", async () => {
      const env = { APP_MODE: "staging", APP_DEBUG: "true" };
      const result = await parse(config, [], env);
      expect(result.options).toEqual({ mode: "staging", debug: true });
    });

    test("arg overrides environment variable", async () => {
      const env = { APP_MODE: "staging" };
      const result = await parse(config, ["--mode", "dev"], env);
      expect(result.options.mode).toBe("dev");
    });

    test("coerces env var strings to correct types", async () => {
      const result = await parse(config, [], { APP_DEBUG: "false" });
      expect(result.options.debug).toBe(false);
    });

    test("treats empty env string as boolean true", async () => {
      const result = await parse(config, [], { APP_DEBUG: "" });
      expect(result.options.debug).toBe(true);
    });
  });

  describe("Validation & Choices", () => {
    const config = createConfig({
      options: {
        region: { type: "string", choices: ["us", "eu"] },
        port: {
          type: "number",
          validate: (n) => n > 1000 || "Port must be > 1000",
        },
      },
    });

    test("passes valid choices", async () => {
      const result = await parse(config, ["--region", "us"]);
      expect(result.options.region).toBe("us");
    });

    test("throws on invalid choice", async () => {
      await expect(parse(config, ["--region", "asia"])).rejects.toThrow(/not a valid choice/);
    });

    test("throws custom validation error", async () => {
      await expect(parse(config, ["--port", "80"])).rejects.toThrow(/Port must be > 1000/);
    });
  });

  describe("Positional Arguments", () => {
    test("throws if positionals provided but not allowed", async () => {
      const config = createConfig({ allowPositionals: false });
      await expect(parse(config, ["file.txt"])).rejects.toThrow(/Unknown argument "file.txt"/);
    });

    test("captures positional arguments when allowed", async () => {
      const config = createConfig({ allowPositionals: true });
      const result = await parse(config, ["--verbose", "src", "dist"]);
      expect(result.positionals).toEqual(["src", "dist"]);
      expect(result.options.verbose).toBe(true);
    });
  });
});

describe("Command System", () => {
  const config: ClideConfig = {
    disableHelp: true,
    options: { "global-opt": { type: "boolean" } },
    commands: {
      build: {
        options: {
          minify: { type: "boolean" },
          target: { type: "string", short: "t" },
        },
      },
      deploy: {
        options: {
          target: { type: "string", short: "t" },
        },
      },
    },
  };

  test("parses subcommand", async () => {
    const result = await parse(config, ["build", "--minify"]);
    expect(result.command).toBe("build");
    expect(result.options.minify).toBe(true);
  });

  test("parses global options when placed BEFORE command", async () => {
    const result = await parse(config, ["--global-opt", "deploy"]);
    expect(result.command).toBe("deploy");
    expect(result.options["global-opt"]).toBe(true);
    expect(result.globalOptions["global-opt"]).toBe(true);
  });

  test("throws if global option is placed AFTER command (Strict Ordering)", async () => {
    await expect(parse(config, ["deploy", "--global-opt"])).rejects.toThrow(/Unknown option/);
  });

  test("isolates command options", async () => {
    await expect(parse(config, ["deploy", "--minify"])).rejects.toThrow(/Unknown option/);
  });

  test("allows reusing short flags in different commands", async () => {
    const build = await parse(config, ["build", "-t", "esnext"]);
    expect(build.options.target).toBe("esnext");

    const deploy = await parse(config, ["deploy", "-t", "aws"]);
    expect(deploy.options.target).toBe("aws");
  });

  test("supports default command", async () => {
    const defConfig = { ...config, defaultCommand: "build" };
    const result = await parse(defConfig, ["--minify"]);

    expect(result.command).toBe("build");
    expect(result.isDefaultCommand).toBe(true);
    expect(result.options.minify).toBe(true);
  });

  test("parses both command options and global options in default command logic", async () => {
    const config: ClideConfig = {
      defaultCommand: "start",
      options: {
        verbose: { type: "boolean", short: "v" },
      },
      commands: {
        start: {
          options: {
            port: { type: "number", short: "p" },
          },
        },
      },
    };

    const result = await parse(config, ["-v", "-p", "3000"]);

    expect(result.command).toBe("start");
    expect(result.isDefaultCommand).toBe(true);

    expect(result.options.verbose).toBe(true);
    expect(result.globalOptions.verbose).toBe(true);

    expect(result.options.port).toBe(3000);
    expect(result.commandOptions.port).toBe(3000);
  });
});

describe("UI & Output (Help System)", () => {
  test("prints help and exits when --help is passed", async () => {
    const { logs, restore } = setupMocks();
    const config = createConfig({
      disableHelp: false,
      description: "Test App",
    });

    try {
      await parse(config, ["--help"]);
    } catch (e) {
      expect((e as Error).message).toBe("PROCESS_EXIT_0");
    }

    restore();

    const output = logs.join("\n");
    expect(output).toContain("Test App");
    expect(output).toContain("USAGE");
    expect(output).toContain("--verbose");
  });

  test("prints error and help when invalid option is used", async () => {
    const { logs, errors, restore } = setupMocks();
    const config = createConfig({ disableHelp: false });

    try {
      await parse(config, ["--invalid-flag"]);
    } catch (e) {
      expect((e as Error).message).toBe("PROCESS_EXIT_1");
    }

    restore();

    expect(errors.join("\n")).toContain("Error: Unknown option");
    expect(logs.join("\n")).toContain("USAGE");
  });

  test("auto-generated help flag does not conflict with user 'h' flag", async () => {
    const config: ClideConfig = {
      disableHelp: false,
      options: {
        host: { type: "string", short: "h" },
      },
    };

    const result = await parse(config, ["-h", "localhost"]);
    expect(result.options.host).toBe("localhost");
  });
});

describe("Interactive Prompts", () => {
  test("prompts for missing required option", async () => {
    const promptMock = mock((_) => Promise.resolve("mock-value"));

    const config: ClideConfig = {
      disableHelp: true,
      promptAsync: promptMock,
      options: {
        token: { type: "string", required: true },
      },
    };

    const result = await parse(config, []);

    expect(promptMock).toHaveBeenCalled();
    expect(result.options.token).toBe("mock-value");
  });

  test("throws if prompt is disabled and required option is missing", async () => {
    const config: ClideConfig = {
      disableHelp: true,
      disablePrompts: true,
      options: {
        token: { type: "string", required: true },
      },
    };

    await expect(parse(config, [])).rejects.toThrow(/Missing required option/);
  });
});

describe("Configuration Validation", () => {
  test("throws if default command does not exist", () => {
    const config: ClideConfig = {
      defaultCommand: "ghost",
      commands: {},
      options: {},
    };
    expect(async () => await clide(config)).toThrow(/default command "ghost" not found/i);
  });

  test("throws if option name contains uppercase letters", () => {
    const config: ClideConfig = {
      options: { Verbose: { type: "boolean" } },
    };
    expect(async () => await clide(config)).toThrow(/must be all lower case/i);
  });

  test("throws if option name starts with a number", () => {
    const config: ClideConfig = {
      options: { "1flag": { type: "boolean" } },
    };
    expect(async () => await clide(config)).toThrow(/must start with an alphabet/i);
  });

  test("throws if short option is duplicated in global scope", () => {
    const config: ClideConfig = {
      options: {
        verbose: { type: "boolean", short: "v" },
        version: { type: "boolean", short: "v" },
      },
    };
    expect(async () => await clide(config)).toThrow(/Short option "-v".*already in use/i);
  });

  test("throws if negatable boolean has conflicting 'no-' option", () => {
    const config: ClideConfig = {
      options: {
        retry: { type: "boolean", negatable: true },
        "no-retry": { type: "boolean" },
      },
    };
    expect(async () => await clide(config)).toThrow(/conflicting option "no-retry"/i);
  });
});

describe("Custom Parsers", () => {
  test("supports custom truthy/falsy values", async () => {
    const config = createConfig();
    const parser = new ClideParser({
      config,
      args: ["--verbose=ok"],
      truthyValues: ["ok"],
      falsyValues: ["nope"],
    });

    const result = await parser.parseConfig();
    expect(result.options.verbose).toBe(true);
  });
});
