import { useEffect, useState } from 'react';
import {
  DEFAULT_LIST_ORDER,
  LIST_ORDER_STORAGE_KEY,
  isListOrder,
  type ListOrder,
} from '@/lib/order';

// Which order the exercise list is shown in, persisted like the chart's period: read
// once at mount, written back on change. The stored value is validated rather than
// trusted - `localStorage` is whatever a previous build left there, and a stale or hand
// edited value must not reach the list as an order the control cannot name.
export function useListOrder() {
  const [order, setOrderState] = useState<ListOrder>(readStoredOrder());

  useEffect(() => {
    try {
      localStorage.setItem(LIST_ORDER_STORAGE_KEY, order);
    } catch {
      // storage unavailable, keep the in-memory order only
    }
  }, [order]);

  const setOrder = (next: ListOrder) => setOrderState(next);

  return { order, setOrder };
}

function readStoredOrder(): ListOrder {
  try {
    const stored = localStorage.getItem(LIST_ORDER_STORAGE_KEY);
    if (isListOrder(stored)) return stored;
  } catch {
    // storage unavailable, fall through to the default
  }
  return DEFAULT_LIST_ORDER;
}
