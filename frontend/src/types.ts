export interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  image_url?: string;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
}

export interface Cart {
  items: CartItem[];
}

export interface Order {
  id: number;
  user_id: number;
  items: CartItem[];
  total: number;
  status: string;
  created_at: string;
}
