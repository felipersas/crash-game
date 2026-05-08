'use client';

/**
 * useBetForm - Bet placement form hook
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { betFormSchema, BetFormSchema } from '../shared/schemas/bet-form.schema';
import { useWallet } from './useWallet';
import { GAME_CONSTANTS } from '../shared/constants/game.constants';

export function useBetForm() {
  const { balance } = useWallet();
  const balanceCents = Math.round(parseFloat(balance) * 100);

  const form = useForm<BetFormSchema>({
    resolver: zodResolver(betFormSchema),
    defaultValues: {
      amount: '',
    },
    mode: 'onChange',
  });

  // Calculate potential payout based on input
  const amountValue = form.watch('amount');
  const potentialPayout = amountValue
    ? Math.round(parseFloat(amountValue) * 100)
    : null;

  return {
    form,
    potentialPayout,
    validation: {
      minBet: GAME_CONSTANTS.MIN_BET,
      maxBet: GAME_CONSTANTS.MAX_BET,
      balance: balance,
      balanceCents,
    },
  };
}
