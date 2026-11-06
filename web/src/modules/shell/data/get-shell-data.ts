import { SHELL_MOCK, type ShellData } from "./shell.mock";

/** Loads the shell's data. Returns typed mock data now; will call the API later. */
export async function getShellData(): Promise<ShellData> {
  return SHELL_MOCK;
}
