import type { TallyRepository } from "../../core/backend/repository";
import { object, type Data } from "../../core/domain/records";
import * as Crypto from "expo-crypto";
/** Registration responses can be lost; refresh the sanitized server revision. */
export async function readOwnedDevice(
  repo: TallyRepository,
  installationId: string,
): Promise<Data | null> {
  let after: string | null = null;
  for (let page = 0; page < 10; page++) {
    repo.check();
    const result = await repo.command(
      "listNotificationDevices",
      { limit: 50, after },
      Crypto.randomUUID(),
    );
    repo.check();
    if (!Array.isArray(result.devices))
      throw new Error("Device registration could not be verified.");
    for (const value of result.devices) {
      const device = object(value);
      if (
        device.userId !== repo.owner ||
        !Number.isSafeInteger(device.revision) ||
        Number(device.revision) < 1
      )
        throw new Error("Device owner could not be verified.");
      if (device.installationId === installationId) return device;
    }
    if (result.nextCursor === null) return null;
    if (typeof result.nextCursor !== "string" || result.nextCursor === after)
      throw new Error("Invalid device page.");
    after = result.nextCursor;
  }
  throw new Error("More than 500 devices require account recovery.");
}
