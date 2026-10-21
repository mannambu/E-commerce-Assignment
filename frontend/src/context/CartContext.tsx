import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '@/services/api';
import { useAuth } from './AuthContext';

export interface CartLineItem {
  _id: string; // Line ID
  id?: string; // Compatibility alias
  itemId: string; // Food ID
  itemName: string;
  name?: string; // Compatibility alias
  unitPrice: number;
  price?: number; // Compatibility alias
  unitCalories?: number;
  calories?: number; // Compatibility alias
  image: string;
  quantity: number;
  qty?: number; // Compatibility alias
  lineTotal: number;
  deliveryDate?: string;
  mealSlot?: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | string;
  availability?: {
    isActive: boolean;
    inStock: boolean;
    availableQuantity: number;
  };
  allergyWarning?: {
    hasMatch: boolean;
    matchedAllergens?: string[];
  };
}

export interface CartIssue {
  code: string;
  message: string;
  lineId?: string;
}

export interface CartSummary {
  itemCount: number;
  lineCount: number;
  subtotal: number;
  totalCalories: number;
  deliveryDates: string[];
  shippingPolicy: 'PER_ORDER' | 'FIRST_DAY_ONLY' | string;
  shippingFee?: number | null;
}

export interface CurrentCart {
  _id?: string;
  userId?: string;
  cartType: 'FOOD' | 'COMBO';
  version: number;
  items: CartLineItem[];
  summary: CartSummary;
  canCheckout: boolean;
  issues: CartIssue[];
}

interface AddItemOptions {
  deliveryDate?: string;
  mealSlot?: string;
  cartType?: 'FOOD' | 'COMBO';
}

interface CartContextType {
  cart: CurrentCart | null;
  items: CartLineItem[];
  cartCount: number;
  subtotal: number;
  totalCalories: number;
  cartType: 'FOOD' | 'COMBO';
  version: number;
  canCheckout: boolean;
  issues: CartIssue[];
  loading: boolean;
  fetchCart: () => Promise<CurrentCart | null>;
  addItem: (
    item: { id?: string | number; itemId?: string | number; name?: string; price?: number; image?: string; calories?: number; type?: string },
    quantity?: number,
    options?: AddItemOptions
  ) => Promise<{ success: boolean; message?: string }>;
  addBulkItems: (
    items: Array<{ itemId: string; quantity: number; deliveryDate?: string; mealSlot?: string }>,
    cartType?: 'FOOD' | 'COMBO'
  ) => Promise<{ success: boolean; message?: string }>;
  updateQty: (lineId: string | number, delta: number) => Promise<void>;
  updateLine: (
    lineId: string,
    payload: { quantity?: number; deliveryDate?: string | null; mealSlot?: string | null }
  ) => Promise<void>;
  removeItem: (lineId: string | number) => Promise<void>;
  clearCart: () => Promise<void>;
  switchMode: (newMode: 'FOOD' | 'COMBO') => Promise<{ success: boolean; message?: string }>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [cart, setCart] = useState<CurrentCart | null>(null);
  const [loading, setLoading] = useState(false);
  const accountId = !authLoading && user?.role === 'Customer' ? user._id : null;
  const accountRef = useRef(accountId);
  accountRef.current = accountId;
  const requestRef = useRef(0);

  // AuthContext determines the role; the API interceptor handles token refresh.
  const fetchCart = useCallback(async (): Promise<CurrentCart | null> => {
    if (accountRef.current !== accountId) return null;
    const requestId = ++requestRef.current;
    if (!accountId) {
      setCart(null);
      setLoading(false);
      return null;
    }
    const isCurrentRequest = () => accountRef.current === accountId && requestRef.current === requestId;

    try {
      setLoading(true);
      const res = await api.get('/cart');
      if (!isCurrentRequest()) return null;
      const rawCurrentCart =
        res.data?.result?.currentCart ||
        res.data?.result?.foodCart ||
        res.data?.result ||
        null;

      if (!rawCurrentCart) {
        setCart(null);
        return null;
      }

      // Chuẩn hóa danh sách items với đầy đủ alias
      const normalizedItems: CartLineItem[] = (rawCurrentCart.items || []).map((item: any) => ({
        ...item,
        _id: item._id || item.id,
        id: item._id || item.id || item.itemId,
        itemId: item.itemId || item.id,
        name: item.itemName || item.name || '',
        price: item.unitPrice ?? item.price ?? 0,
        unitPrice: item.unitPrice ?? item.price ?? 0,
        image: item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
        qty: item.quantity ?? 1,
        quantity: item.quantity ?? 1,
        unitCalories: item.unitCalories ?? item.calories ?? 0,
        calories: item.unitCalories ?? item.calories ?? 0,
        lineTotal: item.lineTotal ?? (item.unitPrice ?? 0) * (item.quantity ?? 1),
      }));

      const normalizedCart: CurrentCart = {
        _id: rawCurrentCart._id,
        userId: rawCurrentCart.userId,
        cartType: rawCurrentCart.cartType || 'FOOD',
        version: rawCurrentCart.version ?? 0,
        items: normalizedItems,
        summary: {
          itemCount: rawCurrentCart.summary?.itemCount ?? normalizedItems.reduce((acc, i) => acc + i.quantity, 0),
          lineCount: rawCurrentCart.summary?.lineCount ?? normalizedItems.length,
          subtotal: rawCurrentCart.summary?.subtotal ?? normalizedItems.reduce((acc, i) => acc + i.lineTotal, 0),
          totalCalories: rawCurrentCart.summary?.totalCalories ?? 0,
          deliveryDates: rawCurrentCart.summary?.deliveryDates || [],
          shippingPolicy: rawCurrentCart.summary?.shippingPolicy || (rawCurrentCart.cartType === 'COMBO' ? 'FIRST_DAY_ONLY' : 'PER_ORDER'),
          shippingFee: rawCurrentCart.summary?.shippingFee ?? null,
        },
        canCheckout: Boolean(rawCurrentCart.canCheckout),
        issues: rawCurrentCart.issues || [],
      };

      setCart(normalizedCart);
      return normalizedCart;
    } catch (err: any) {
      if (!isCurrentRequest()) return null;
      if (err?.response?.status === 401) {
        setCart(null);
      }
      console.error('Lỗi khi lấy giỏ hàng:', err);
      return null;
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    setCart(null);
    void fetchCart();
    return () => { requestRef.current += 1; };
  }, [fetchCart]);

  // Lắng nghe sự kiện đăng nhập/đăng xuất/đổi hồ sơ để re-fetch cart
  useEffect(() => {
    const handleSync = () => {
      fetchCart();
    };
    window.addEventListener('fitbite-profile-updated', handleSync);
    return () => window.removeEventListener('fitbite-profile-updated', handleSync);
  }, [fetchCart]);

  const addItem = async (
    item: { id?: string | number; itemId?: string | number; name?: string; price?: number; image?: string; calories?: number },
    quantity: number = 1,
    options?: AddItemOptions
  ): Promise<{ success: boolean; message?: string }> => {
    const foodId = String(item.itemId || item.id || '');
    if (!foodId) return { success: false, message: 'Thiếu mã món ăn' };

    try {
      const payload: any = {
        itemId: foodId,
        quantity,
        version: cart?.version ?? 0,
      };

      if (options?.cartType) payload.cartType = options.cartType;
      if (options?.deliveryDate) payload.deliveryDate = options.deliveryDate;
      if (options?.mealSlot) payload.mealSlot = options.mealSlot;

      await api.post('/cart/items', payload);
      await fetchCart();
      return { success: true };
    } catch (err: any) {
      if (err?.response?.status === 409) {
        await fetchCart();
      }
      const msg = err?.response?.data?.message || 'Không thể thêm món vào giỏ hàng';
      return { success: false, message: msg };
    }
  };

  const addBulkItems = async (
    bulkItems: Array<{ itemId: string; quantity: number; deliveryDate?: string; mealSlot?: string }>,
    targetCartType?: 'FOOD' | 'COMBO'
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const payload: any = {
        cartType: targetCartType || cart?.cartType || 'COMBO',
        version: cart?.version ?? 0,
        items: bulkItems,
      };

      await api.post('/cart/items/bulk', payload);
      await fetchCart();
      return { success: true };
    } catch (err: any) {
      if (err?.response?.status === 409) {
        await fetchCart();
      }
      const msg = err?.response?.data?.message || 'Không thể thêm thực đơn vào giỏ hàng';
      return { success: false, message: msg };
    }
  };

  const updateLine = async (
    lineId: string,
    payload: { quantity?: number; deliveryDate?: string | null; mealSlot?: string | null }
  ) => {
    try {
      await api.patch(`/cart/items/${lineId}`, {
        ...payload,
        version: cart?.version ?? 0,
      });
      await fetchCart();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        await fetchCart();
      }
      throw err;
    }
  };

  const updateQty = async (lineIdOrFoodId: string | number, delta: number) => {
    const currentItem = (cart?.items || []).find(
      (i) => i._id === String(lineIdOrFoodId) || i.id === String(lineIdOrFoodId) || i.itemId === String(lineIdOrFoodId)
    );
    if (!currentItem) return;

    const lineId = currentItem._id;
    const newQty = currentItem.quantity + delta;

    try {
      if (newQty <= 0) {
        await removeItem(lineId);
      } else {
        await updateLine(lineId, { quantity: newQty });
      }
    } catch (err) {
      console.error('Lỗi cập nhật số lượng:', err);
    }
  };

  const removeItem = async (lineIdOrFoodId: string | number) => {
    const currentItem = (cart?.items || []).find(
      (i) => i._id === String(lineIdOrFoodId) || i.id === String(lineIdOrFoodId) || i.itemId === String(lineIdOrFoodId)
    );
    const lineId = currentItem ? currentItem._id : String(lineIdOrFoodId);

    try {
      await api.delete(`/cart/items/${lineId}`, {
        data: { version: cart?.version ?? 0 },
      });
      await fetchCart();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        await fetchCart();
      }
      console.error('Lỗi xóa món khỏi giỏ hàng:', err);
    }
  };

  const clearCart = async () => {
    try {
      await api.delete('/cart', {
        data: { version: cart?.version ?? 0 },
      });
      await fetchCart();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        await fetchCart();
      }
      console.error('Lỗi làm trống giỏ hàng:', err);
    }
  };

  const switchMode = async (newMode: 'FOOD' | 'COMBO'): Promise<{ success: boolean; message?: string }> => {
    try {
      await api.patch('/cart/mode', {
        cartType: newMode,
        version: cart?.version ?? 0,
      });
      await fetchCart();
      return { success: true };
    } catch (err: any) {
      if (err?.response?.status === 409) {
        await fetchCart();
      }
      const msg = err?.response?.data?.message || 'Không thể chuyển đổi chế độ giỏ hàng khi giỏ chưa rỗng';
      return { success: false, message: msg };
    }
  };

  const items = cart?.items || [];
  const cartCount = cart?.summary?.itemCount ?? items.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = cart?.summary?.subtotal ?? 0;
  const totalCalories = cart?.summary?.totalCalories ?? 0;
  const cartType = cart?.cartType || 'FOOD';
  const version = cart?.version ?? 0;
  const canCheckout = cart?.canCheckout ?? false;
  const issues = cart?.issues || [];

  return (
    <CartContext.Provider
      value={{
        cart,
        items,
        cartCount,
        subtotal,
        totalCalories,
        cartType,
        version,
        canCheckout,
        issues,
        loading,
        fetchCart,
        addItem,
        addBulkItems,
        updateQty,
        updateLine,
        removeItem,
        clearCart,
        switchMode,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
