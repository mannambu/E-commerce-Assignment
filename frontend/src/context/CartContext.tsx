import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import api from '@/services/api';

interface CartItem {
  id: string | number;
  name: string;
  price: number;
  image: string;
  qty: number;
  calories?: number;
  type: 'food' | 'pt';
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'qty'>, quantity?: number) => Promise<void>;
  removeItem: (id: string | number) => Promise<void>;
  updateQty: (id: string | number, delta: number) => Promise<void>;
  clearCart: () => Promise<void>;
  cartCount: number;
  subtotal: number;
  fetchCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const getValidStoredToken = () => {
  const rawToken = localStorage.getItem('access_token');
  const token = rawToken?.replace(/^"|"$/g, '').trim();

  if (!token || token.split('.').length !== 3) {
    if (rawToken) localStorage.removeItem('access_token');
    return null;
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload?.exp && payload.exp * 1000 <= Date.now()) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      return null;
    }
  } catch {
    localStorage.removeItem('access_token');
    return null;
  }

  return token;
};

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const initializedRef = useRef(false);

  // Lấy giỏ hàng từ Backend
  const fetchCart = async () => {
    const token = getValidStoredToken();
    if (!token) return; // Nếu chưa đăng nhập thì không gọi API giỏ hàng

    try {
      const res = await api.get('/cart');
      const foodCart = res.data.result.foodCart;
      
      if (foodCart && foodCart.items) {
        // Map dữ liệu từ BE sang FE
        const mappedItems: CartItem[] = foodCart.items.map((item: any) => ({
          id: item.itemId,
          name: item.itemName,
          price: item.unitPrice,
          image: item.image || 'https://picsum.photos/seed/food/200/200', // fallback ảnh nếu thiếu
          qty: item.quantity,
          calories: item.unitCalories,
          type: 'food'
        }));
        setItems(mappedItems);
        setSubtotal(foodCart.summary?.subtotal || 0);
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setItems([]);
        setSubtotal(0);
      }
      console.error('Lỗi khi lấy giỏ hàng:', err);
    }
  };

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    fetchCart();
  }, []);

  const addItem = async (newItem: Omit<CartItem, 'qty'>, quantity: number = 1) => {
    try {
      // Gọi API thêm vào giỏ
      await api.post('/cart/items', { 
        itemId: newItem.id, 
        quantity: quantity 
      });
      // Gọi lại hàm fetch để cập nhật state đồng bộ với BE
      await fetchCart();
    } catch (err) {
      console.error('Lỗi thêm giỏ hàng:', err);
    }
  };

  const removeItem = async (id: string | number) => {
    try {
      await api.delete(`/cart/items/${id}`);
      await fetchCart();
    } catch (err) {
      console.error('Lỗi xóa giỏ hàng:', err);
    }
  };

  const updateQty = async (id: string | number, delta: number) => {
    try {
      const currentItem = items.find(i => i.id === id);
      if (!currentItem) return;
      
      const newQty = Math.max(1, currentItem.qty + delta); // Đảm bảo số lượng >= 1
      await api.patch(`/cart/items/${id}`, { quantity: newQty });
      await fetchCart();
    } catch (err) {
      console.error('Lỗi cập nhật số lượng:', err);
    }
  };

  const clearCart = async () => {
    try {
      await api.delete('/cart/food'); // Xóa giỏ food theo API spec
      await fetchCart();
    } catch (err) {
      console.error('Lỗi xóa toàn bộ giỏ hàng:', err);
    }
  };

  const cartCount = items.reduce((acc, item) => acc + item.qty, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, clearCart, cartCount, subtotal, fetchCart }}>
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