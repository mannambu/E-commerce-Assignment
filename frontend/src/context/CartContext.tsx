import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '@/services/api';
import { apiError } from '@/lib/admin';
import { normalizeCart } from '@/lib/cart';
import { useAuth } from './AuthContext';

export interface CartLineItem {
  _id: string; id?: string; itemId: string; itemName: string; name?: string;
  unitPrice: number; price?: number; unitCalories?: number; calories?: number;
  image: string; quantity: number; qty?: number; lineTotal: number;
  deliveryDate?: string; mealSlot?: string;
  availability?: { isActive: boolean; inStock: boolean; availableQuantity: number };
  allergyWarning?: { hasMatch: boolean; matchedAllergens?: string[] };
}
export interface CartIssue { code: string; message: string; lineId?: string }
export interface CartSummary {
  itemCount: number; lineCount: number; subtotal: number; totalCalories: number;
  deliveryDates: string[]; shippingPolicy: string; shippingFee?: number | null;
}
export interface CurrentCart {
  _id?: string; userId?: string; cartType: 'FOOD' | 'COMBO'; version: number;
  items: CartLineItem[]; summary: CartSummary; canCheckout: boolean; issues: CartIssue[];
}
interface CartContextType {
  cart: CurrentCart | null; items: CartLineItem[]; cartCount: number; subtotal: number;
  totalCalories: number; cartType: 'FOOD' | 'COMBO'; version: number; canCheckout: boolean;
  issues: CartIssue[]; loading: boolean; mutating: boolean; error: string;
  fetchCart: () => Promise<CurrentCart | null>;
  addItem: (
    item: { id?: string | number; itemId?: string | number; name?: string; price?: number; image?: string; calories?: number; type?: string },
    quantity?: number, options?: { deliveryDate?: string; mealSlot?: string; cartType?: 'FOOD' | 'COMBO' }
  ) => Promise<{ success: boolean; message?: string }>;
  addBulkItems: (items: Array<{ itemId: string; quantity: number; deliveryDate?: string; mealSlot?: string }>, cartType?: 'FOOD' | 'COMBO') => Promise<{ success: boolean; message?: string }>;
  updateQty: (lineId: string | number, delta: number) => Promise<void>;
  updateLine: (lineId: string, payload: { quantity?: number; deliveryDate?: string | null; mealSlot?: string | null }) => Promise<void>;
  removeItem: (lineId: string | number) => Promise<void>;
  clearCart: () => Promise<void>;
  switchMode: (mode: 'FOOD' | 'COMBO') => Promise<{ success: boolean; message?: string }>;
}
const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [cart, setCart] = useState<CurrentCart | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const cartRef = useRef<CurrentCart | null>(null);
  const mutationRef = useRef(false);
  const accountId = !authLoading && user?.role === 'Customer' ? user._id : null;
  const accountRef = useRef(accountId);
  accountRef.current = accountId;
  const requestRef = useRef(0);

  const fetchCart = useCallback(async (): Promise<CurrentCart | null> => {
    if (accountRef.current !== accountId) return null;
    const requestId = ++requestRef.current;
    if (!accountId) {
      cartRef.current = null; setCart(null); setLoading(false);
      return null;
    }
    const isCurrentRequest = () => accountRef.current === accountId && requestRef.current === requestId;
    try {
      setLoading(true); setError('');
      const response = await api.get('/cart');
      if (!isCurrentRequest()) return null;
      const updated = normalizeCart(response.data?.result);
      cartRef.current = updated; setCart(updated);
      return updated;
    } catch (err) {
      if (!isCurrentRequest()) return null;
      if ((err as { response?: { status?: number } }).response?.status === 401) {
        cartRef.current = null; setCart(null);
      }
      setError(apiError(err));
      return null;
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    cartRef.current = null; setCart(null); setError('');
    void fetchCart();
    return () => { requestRef.current += 1; };
  }, [fetchCart]);

  useEffect(() => {
    const sync = () => { void fetchCart(); };
    window.addEventListener('fitbite-profile-updated', sync);
    return () => window.removeEventListener('fitbite-profile-updated', sync);
  }, [fetchCart]);

  // Read the latest server version even across sequential actions in one event handler.
  const mutate = async (method: 'post' | 'patch' | 'delete', url: string, data: Record<string, unknown> = {}) => {
    if (!accountId || accountRef.current !== accountId) throw new Error('Vui lòng đăng nhập bằng tài khoản khách hàng.');
    if (mutationRef.current) throw new Error('Giỏ hàng đang được cập nhật. Vui lòng chờ.');
    mutationRef.current = true; setMutating(true); setError('');
    try {
      const current = cartRef.current || await fetchCart();
      if (!current || accountRef.current !== accountId) throw new Error('Chưa tải được giỏ hàng. Vui lòng thử lại.');
      requestRef.current += 1;
      const response = await api.request({ method, url, data: { ...data, version: current.version } });
      if (accountRef.current !== accountId) throw new Error('Phiên đăng nhập đã thay đổi.');
      // Older GET responses must not overwrite this mutation's result.
      requestRef.current += 1;
      const updated = normalizeCart(response.data?.result);
      cartRef.current = updated; setCart(updated);
    } catch (err) {
      if (accountRef.current === accountId) {
        // Re-read after conflicts/network failures, but never replay a write automatically.
        await fetchCart();
        setError(apiError(err));
      }
      throw err;
    } finally {
      mutationRef.current = false; setMutating(false);
      if (accountRef.current === accountId) setLoading(false);
    }
  };

  const addItem: CartContextType['addItem'] = async (item, quantity = 1, options) => {
    try {
      const itemId = String(item.itemId || item.id || '');
      if (!itemId) throw new Error('Thiếu mã món ăn.');
      await mutate('post', '/cart/items', { itemId, quantity, cartType: 'FOOD', ...options });
      return { success: true };
    } catch (err) { return { success: false, message: apiError(err) }; }
  };
  const addBulkItems: CartContextType['addBulkItems'] = async (items, cartType = 'COMBO') => {
    try {
      await mutate('post', '/cart/items/bulk', { items, cartType });
      return { success: true };
    } catch (err) { return { success: false, message: apiError(err) }; }
  };
  const updateLine: CartContextType['updateLine'] = async (lineId, payload) => {
    await mutate('patch', '/cart/items/' + lineId, payload);
  };
  const updateQty: CartContextType['updateQty'] = async (lineId, delta) => {
    const item = cartRef.current?.items.find(item => item._id === String(lineId));
    if (!item) throw new Error('Dòng giỏ hàng đã thay đổi. Vui lòng tải lại.');
    await updateLine(item._id, { quantity: Math.max(0, item.quantity + delta) });
  };
  const removeItem: CartContextType['removeItem'] = async lineId => {
    await mutate('delete', '/cart/items/' + lineId);
  };
  const clearCart = async () => { await mutate('delete', '/cart'); };
  const switchMode: CartContextType['switchMode'] = async cartType => {
    try {
      await mutate('patch', '/cart/mode', { cartType });
      return { success: true };
    } catch (err) { return { success: false, message: apiError(err) }; }
  };

  const items = cart?.items || [];
  return <CartContext.Provider value={{
    cart, items, cartCount: cart?.summary.itemCount ?? 0, subtotal: cart?.summary.subtotal ?? 0,
    totalCalories: cart?.summary.totalCalories ?? 0, cartType: cart?.cartType || 'FOOD',
    version: cart?.version ?? 0, canCheckout: cart?.canCheckout ?? false, issues: cart?.issues || [],
    loading, mutating, error, fetchCart, addItem, addBulkItems, updateQty, updateLine, removeItem, clearCart, switchMode
  }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
}
