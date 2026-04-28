'use client';
import { createContext, useContext } from 'react';

export const PlanContext = createContext({ plan: 'pro_plus', openUpgrade: () => {} });

export function usePlan() {
  return useContext(PlanContext);
}

export function isPro() {
  return true;
}
