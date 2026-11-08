import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
const ledgerSchema = z.strictObject({ spent: z.number().finite().nonnegative(), reservations: z.record(z.string(), z.number().finite().nonnegative()), missions: z.array(z.strictObject({ runId: z.string(), calls: z.number().int().nonnegative() })) });
// Cache-write rate is the conservative input ceiling; no cache discount assumed.
const cost = (input: number, output: number) => (input * .25 + output * 1.20) / 1_000_000;
export class Budget {
  constructor(private path: string, private allowance = 5) { if (!Number.isFinite(allowance) || allowance < 0) throw new Error('invalid_budget'); }
  private read() {
    try { return ledgerSchema.parse(JSON.parse(readFileSync(this.path, 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { spent: 0, reservations: {}, missions: [] }; throw new Error('budget_unavailable'); }
  }
  private write(data: z.infer<typeof ledgerSchema>) {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = this.path + '.tmp';
    writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 }); renameSync(temporary, this.path);
  }
  reserve(input: number, output: number, runId?: string): string {
    if (![input, output].every(n => Number.isInteger(n) && n >= 0)) throw new Error('invalid_usage');
    const data = this.read(), amount = cost(input, output);
    const mission = data.missions.find(m => m.runId === runId);
    if (runId && (mission?.calls ?? 0) >= 24) throw new Error('mission_quota');
    if (data.spent + Object.values(data.reservations).reduce((a, b) => a + b, 0) + amount > this.allowance) throw new Error('budget_exhausted');
    const id = randomUUID(); data.reservations[id] = amount;
    if (runId) { if (mission) mission.calls++; else data.missions.push({ runId, calls: 1 }); }
    this.write(data); return id;
  }
  reconcile(id: string, input: number, output: number): void {
    if (![input, output].every(n => Number.isInteger(n) && n >= 0)) throw new Error('invalid_usage');
    const data = this.read(); if (!(id in data.reservations)) throw new Error('unknown_reservation');
    delete data.reservations[id]; data.spent += cost(input, output); this.write(data);
  }
}
