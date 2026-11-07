import { z } from 'zod';
import { ScenarioSpecSchema, RecordedCommandSchema, SimEventSchema, TelemetrySchema, CommandReceiptSchema } from '../shared/schemas';

const finite = z.number().finite();
const nonnegative = finite.nonnegative();
export const PhysicalStateSchema = z.strictObject({
  sources: z.strictObject({ utilityAvailable: z.boolean(), generatorReady: z.boolean(), transferComplete: z.boolean() }),
  controllerFault: z.boolean(), pulse: nonnegative,
  racks: z.array(z.strictObject({
    id: z.string(), temperatureC: finite, backlog: nonnegative, batchCeiling: nonnegative,
    mode: z.enum(['ready', 'throttled', 'off', 'booting']), thermalLatched: z.boolean(), resetRequested: z.boolean(),
    bootRemainingSeconds: nonnegative, hotSeconds: nonnegative, tripSeconds: nonnegative, coolSeconds: nonnegative,
    powered: z.boolean(), powerKw: nonnegative, critical: nonnegative, interactive: nonnegative, batch: nonnegative,
  })),
  ups: z.array(z.strictObject({ id: z.string(), energyKwh: nonnegative, tripped: z.boolean(), faulted: z.boolean() })),
  cooling: z.array(z.strictObject({ id: z.string(), ready: z.boolean(), restartRemainingSeconds: nonnegative })),
  totals: z.strictObject({
    criticalDemand: nonnegative, criticalDelivered: nonnegative, interactiveDemand: nonnegative, interactiveDelivered: nonnegative,
    batchArrivals: nonnegative, batchCompleted: nonnegative, batchDelayUnitSeconds: nonnegative,
    itEnergyKwh: nonnegative, coolingEnergyKwh: nonnegative, sourceEnergyKwh: nonnegative,
  }),
  lastInterval: z.strictObject({ itPowerKw: nonnegative, coolingThermalKw: nonnegative, coolingElectricKw: nonnegative, itInputKw: nonnegative, chargeInputKw: nonnegative, sourceUsedKw: nonnegative, sourceCapacityKw: nonnegative.nullable(), criticalServedFraction: nonnegative.max(1), interactiveServedFraction: nonnegative.max(1) }),
});
export type PhysicalState = z.infer<typeof PhysicalStateSchema>;
export type RackState = PhysicalState['racks'][number];

export const EngineStateSchema = z.strictObject({
  scenario: ScenarioSpecSchema, physical: PhysicalStateSchema, initialPhysical: PhysicalStateSchema,
  eventCursor: nonnegative.int(), nextSequence: nonnegative.int(),
  commands: z.array(RecordedCommandSchema), events: z.array(SimEventSchema), telemetry: z.array(TelemetrySchema),
  idempotency: z.array(z.strictObject({ actorId: z.string(), key: z.string(), intent: z.string(), receipt: CommandReceiptSchema })),
});
export type EngineState = z.infer<typeof EngineStateSchema>;
