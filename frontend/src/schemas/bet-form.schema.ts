import { z } from 'zod';
import { GAME_CONSTANTS } from '@/constants/game';

export const betFormSchema = z.object({
  amountCents: z
    .number({ message: 'Enter a bet amount' })
    .int()
    .min(GAME_CONSTANTS.MIN_BET_CENTS, `Minimum bet is $${GAME_CONSTANTS.MIN_BET.toFixed(2)}`)
    .max(GAME_CONSTANTS.MAX_BET_CENTS, `Maximum bet is $${GAME_CONSTANTS.MAX_BET.toFixed(2)}`),
});

export type BetFormValues = z.infer<typeof betFormSchema>;
