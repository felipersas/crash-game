import { z } from 'zod';
import { GAME_CONSTANTS } from '@/constants/game';

export const betFormSchema = z.object({
  amountCents: z
    .number({ message: 'Enter a bet amount' })
    .int()
    .min(GAME_CONSTANTS.MIN_BET_CENTS, `Minimum bet is $${GAME_CONSTANTS.MIN_BET.toFixed(2)}`)
    .max(GAME_CONSTANTS.MAX_BET_CENTS, `Maximum bet is $${GAME_CONSTANTS.MAX_BET.toFixed(2)}`),
  targetMultiplier: z
    .number()
    .min(1.01, 'Minimum is 1.01x')
    .max(1000, 'Maximum is 1000x')
    .multipleOf(0.01, 'Max 2 decimal places')
    .optional(),
});

export type BetFormValues = z.infer<typeof betFormSchema>;
