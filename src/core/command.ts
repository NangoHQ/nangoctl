import { z, type ZodTypeAny } from 'zod';
import { ProcRunner } from './proc.js';
import { JsonOut, StdoutOut } from './output/output.js';

export type CommandCtx = {
    proc: ProcRunner;
    out: StdoutOut | JsonOut;
    verbose: boolean;
};

export function createCmd<TSchema extends ZodTypeAny, TOut>(
    schema: TSchema,
    handler: (opts: z.infer<TSchema>, ctx: CommandCtx) => Promise<TOut>
) {
    return async (rawOpts: unknown) => {
        const parsed = schema.parse(rawOpts);
        const verbose = Boolean((parsed as any).verbose);
        const json = Boolean((parsed as any).json);

        const ctx: CommandCtx = {
            proc: new ProcRunner(),
            out: json ? new JsonOut() : new StdoutOut(),
            verbose,
        };
        return await handler(parsed as any, ctx);
    };
}

