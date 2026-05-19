import { importFromSucai } from "./import-sucai.js";

const force = process.argv.includes("--force");

importFromSucai(force).catch((err) => {
  console.error(err);
  process.exit(1);
});
