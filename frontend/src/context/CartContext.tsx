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
  deliveryDate?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'qty'>, quantity?: number, deliveryDate?: string) => Promise<void>;
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
    return { token, payload };
  } catch {
    localStorage.removeItem('access_token');
    return null;
  }
};

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const initializedRef = useRef(false);

  // Lấy giỏ hàng từ Backend
  const fetchCart = async () => {
    const authData = getValidStoredToken();
    if (!authData) return; // Nếu chưa đăng nhập thì không gọi API

    // Tránh gọi API giỏ hàng nếu tài khoản đăng nhập là Admin (khắc phục lỗi 403)
    if (authData.payload?.role === 'admin') {
      setItems([]);
      setSubtotal(0);
      return;
    }

    try {
      const res = await api.get('/cart');
      const foodCart = res.data?.result?.foodCart;
      
      if (foodCart && foodCart.items) {
        // Map dữ liệu từ BE sang FE
        const mappedItems: CartItem[] = foodCart.items.map((item: any) => ({
          id: item.itemId,
          name: item.itemName,
          price: item.unitPrice,
          image: item.image || 'https://picsum.photos/seed/food/200/200',
          qty: item.quantity,
          calories: item.unitCalories,
          type: 'food',
          deliveryDate: item.deliveryDate
        }));
        setItems(mappedItems);
        setSubtotal(foodCart.summary?.subtotal || 0);
      }
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
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

const addItem = async (
  newItem: Omit<CartItem, 'qty'>, 
  quantity: number = 1, 
  deliveryDate?: string
) => {
  try {
    const defaultDate = new Date().toISOString().split('T')[0];

    // 1. Gửi request thêm món
    await api.post('/cart/items', { 
      itemId: newItem.id, 
      quantity: quantity,
      deliveryDate: deliveryDate || newItem.deliveryDate || defaultDate
    });

    await fetchCart();
  } catch (err: any) {
    // 2. Nếu dính 409 Conflict (xung đột món lẻ và combo)
    if (err?.response?.status === 409) {
      const confirmClear = window.confirm(
        'Giỏ hàng hiện tại đang chứa món loại khác (món lẻ / combo tuần). Bạn có muốn XÓA SẠCH giỏ hàng cũ để thêm món này không?'
      );
      
      if (confirmClear) {
        try {
          // Gọi chính xác API xóa giỏ food của Backend FitBite
          await api.delete('/cart/food');

          // Sau khi xóa sạch giỏ cũ thành công, thêm lại món mới
          const defaultDate = new Date().toISOString().split('T')[0];
          await api.post('/cart/items', { 
            itemId: newItem.id, 
            quantity: quantity,
            deliveryDate: deliveryDate || newItem.deliveryDate || defaultDate
          });

          await fetchCart();
          alert('Đã xóa giỏ hàng cũ và thêm món mới thành công!');
        } catch (retryErr) {
          console.error('Lỗi khi làm sạch giỏ hàng:', retryErr);
          alert('Không thể tự động xóa giỏ hàng. Bạn vui lòng bấm vào biểu tượng Giỏ hàng trên Menu để xóa thủ công nhé!');
        }
      }
      return;
    }
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
      
      const newQty = Math.max(1, currentItem.qty + delta);
      await api.patch(`/cart/items/${id}`, { quantity: newQty });
      await fetchCart();
    } catch (err) {
      console.error('Lỗi cập nhật số lượng:', err);
    }
  };

  const clearCart = async () => {
    try {
      await api.delete('/cart/food');
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