import { z } from 'zod';
import { GAME_CONSTANTS } from '@/constants/game';
import { formatMoney } from '@/domain/money';

export const betFormSchema = z.object({
  amountCents: z
    .number({ message: 'Enter a bet amount' })
    .int()
    .min(GAME_CONSTANTS.MIN_BET_CENTS, `Minimum bet is ${formatMoney(GAME_CONSTANTS.MIN_BET_CENTS)}`)
    .max(GAME_CONSTANTS.MAX_BET_CENTS, `Maximum bet is ${formatMoney(GAME_CONSTANTS.MAX_BET_CENTS)}`),
  targetMultiplier: z
    .number({ message: 'Enter a valid multiplier' })
    .min(GAME_CONSTANTS.MIN_AUTO_CASHOUT, `Minimum is ${GAME_CONSTANTS.MIN_AUTO_CASHOUT}x`)
    .max(GAME_CONSTANTS.MAX_AUTO_CASHOUT, `Maximum is ${GAME_CONSTANTS.MAX_AUTO_CASHOUT}x`)
    .multipleOf(0.01, 'Max 2 decimal places')
    .optional(),
});

export type BetFormValues = z.infer<typeof betFormSchema>;
