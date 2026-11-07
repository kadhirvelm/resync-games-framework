/** biome-ignore-all lint/suspicious/noConsole: CLI needs to log */
import chalk from "chalk";

export function logColorMessage(
  message: string,
  color: "green" | "red" | "yellow",
) {
  switch (color) {
    case "green":
      console.log(chalk.green(message));
      break;
    case "red":
      console.log(chalk.red(message));
      break;
    case "yellow":
      console.log(chalk.yellow(message));
      break;
  }
}
