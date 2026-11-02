#!/usr/bin/env bun

import { Command } from "commander";
import { cdDirectory } from "./actions/cdDirectory";
import { checkMigrations } from "./actions/checkMigrations";
import { database } from "./actions/database";
import { dev } from "./actions/dev";
import { ensureEnvFileInSync } from "./actions/ensureEnvInSync";
import { loadEnvironment } from "./actions/loadEnvironment";
import { open } from "./actions/open";
import { runTests } from "./actions/runTests";

const program = new Command()
  .name("toc")
  .description("Resync Game Framework CLI — useful tasks for the monorepo")
  .version("0.1.0");

program
  .command("ensure-env")
  .description("Ensures the environment file is in sync")
  .action(() => {
    ensureEnvFileInSync();
  });

program
  .command("load-env")
  .description("Loads the environment variables")
  .action(loadEnvironment);

program
  .command("dev")
  .description(
    "Runs the migrations, loads the environment and runs the development server",
  )
  .option(
    "--network",
    "Expose the development server publicly via ngrok tunnels (torn down on exit)",
    false,
  )
  .option("--reset", "Reset the Docker environment", false)
  .action(({ network, reset }: { network: boolean; reset: boolean }) =>
    dev(network, reset),
  );

program
  .command("open")
  .description(
    "Opens the frontend in the browser (FRONTEND_URL from .env when set)",
  )
  .action(() => open());

program
  .command("database")
  .argument("args...", "The arguments to pass to the database")
  .description(
    "Runs the database commands by first loading the environment variables",
  )
  .action(database);

program
  .command("check-migrations")
  .description(
    "Checks the migrations, mostly used in CI to ensure the migrations are in sync with the schema",
  )
  .action(checkMigrations);

program
  .command("run-tests")
  .description("Runs the tests, creating a test database as required")
  .argument(
    "<testType>",
    "The type of test to run, either frontend, backend, or all",
  )
  .argument(
    "[args...]",
    "The arguments to pass to the test, useful for specifying a specific test file to run",
  )
  .action(runTests);

program
  .command("cd")
  .description("Moves the terminal to the frontend directory")
  .argument("<directory>", "The directory to move to")
  .action((directory) => {
    cdDirectory(directory);
  });

program.parse(process.argv);
