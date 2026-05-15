import type { Cart, CartItem, Order, Product } from '../types';

function hdrs(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export async function getProducts(token: string): Promise<Product[]> {
  const res = await fetch('/api/products', { headers: hdrs(token) });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function addProduct(token: string, body: { name: string; price: number; stock: number; image: File }): Promise<Product> {
  const form = new FormData();
  form.append('name', body.name);
  form.append('price', String(body.price));
  form.append('stock', String(body.stock));
  form.append('image', body.image);
  const res = await fetch('/api/products', { method: 'POST', headers: hdrs(token), body: form });
  return res.json();
}

export async function getCart(token: string, userId: string): Promise<Cart> {
  const res = await fetch(`/api/cart/${userId}`, { headers: hdrs(token) });
  return res.json();
}

export async function addToCart(token: string, userId: string, item: CartItem): Promise<Cart> {
  const res = await fetch(`/api/cart/${userId}`, { method: 'POST', headers: hdrs(token, true), body: JSON.stringify(item) });
  return res.json();
}

export async function removeFromCart(token: string, userId: string, productId: string): Promise<Cart> {
  const res = await fetch(`/api/cart/${userId}/${productId}`, { method: 'DELETE', headers: hdrs(token) });
  return res.json();
}

export async function createOrder(token: string): Promise<Order> {
  const res = await fetch('/api/orders', { method: 'POST', headers: hdrs(token, true) });
  return res.json();
}

export async function getOrders(token: string, userId: string): Promise<Order[]> {
  const res = await fetch(`/api/orders/${userId}`, { headers: hdrs(token) });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
