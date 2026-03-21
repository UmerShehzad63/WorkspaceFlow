'use client';
import { createContext, useContext } from 'react';

export const PlanContext = createContext({ plan: 'free', openUpgrade: () => {} });

export function usePlan() {
  return useContext(PlanContext);
}

/**
 * Returns true if the given plan has Pro (or above) access.
 * - null / undefined / 'free' / 'canceled' / 'expired' → false
 * - 'trialing' / 'pro_trial' / 'active' / 'pro' / 'pro_plus' → true
 */
export function isPro(plan) {
  return ['pro', 'pro_plus', 'trialing', 'pro_trial', 'active'].includes(plan);
}
