import { Predicate } from "effect";
import { AiError } from "effect/unstable/ai";
import { createTicketClient } from "./client.js";

const client = createTicketClient();
const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

try {
  const document = process.argv.slice(2).join(" ") || "I was charged twice. Please fix this ASAP.";
  const result = await client.assess({ document }, { signal: controller.signal });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (controller.signal.aborted) {
    console.error("Evaluation cancelled.");
  } else if (AiError.isAiError(error)) {
    console.error(`TypeSafe evaluation failed: ${error.reason._tag}`);
  } else if (Predicate.hasProperty(error, "_tag") && error._tag === "ConfigError") {
    console.error("Configuration failed. Set TYPESAFE_API_KEY in .env.");
  } else if (Predicate.hasProperty(error, "_tag") && error._tag === "TimeoutError") {
    console.error("TypeSafe evaluation exceeded the 10-second deadline.");
  } else {
    console.error("Evaluation failed unexpectedly. Run pnpm typecheck and pnpm test to check the setup.");
  }
  process.exitCode = 1;
} finally {
  await client.close();
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
