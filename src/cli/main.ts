import { run } from "./app";
import { pickStyle } from "./table";

const style = pickStyle(process.stdout, process.env);

process.exitCode = await run(process.argv.slice(2), {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
  style,
  cwd: process.cwd(),
});
