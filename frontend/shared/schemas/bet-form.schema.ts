import { z } from 'zod';

export const betFormSchema = z.object({
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((val) => !isNaN(parseFloat(val)), {
      message: 'Invalid amount format',
    })
    .refine(
      (val) => {
        const cents = Math.round(parseFloat(val) * 100);
        return cents >= 100 && cents <= 100000;
      },
      {
        message: 'Bet must be between $1.00 and $1,000.00',
      }
    )
    .refine(
      (val) => /^\d+(\.\d{1,2})?$/.test(val),
      {
        message: 'Use format like 10.00 or 100',
      }
    ),
});

export type BetFormSchema = z.infer<typeof betFormSchema>;
